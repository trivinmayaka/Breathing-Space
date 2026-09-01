import { Router } from "express";
import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { db, depositRequests, liveTraders } from "@workspace/db";

const router = Router();

function webhookValue(body: Record<string, unknown>, key: string): unknown {
  if (body[key] !== undefined) return body[key];
  const data = body.data;
  if (data && typeof data === "object") return (data as Record<string, unknown>)[key];
  return undefined;
}

function isSuccessfulWebhook(body: Record<string, unknown>): boolean {
  const values = ["state", "status", "event", "event_type"]
    .map((key) => webhookValue(body, key))
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toUpperCase());
  return values.some((value) =>
    ["COMPLETE", "COMPLETED", "SUCCESS", "SUCCESSFUL", "PAID"].includes(value),
  );
}

// IntaSend posts payment state changes here. Configure this URL in the IntaSend
// dashboard as https://<published-domain>/api/payments/intasend/webhook.
router.post("/payments/intasend/webhook", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!isSuccessfulWebhook(body)) {
      return void res.status(200).json({ ok: true, ignored: true });
    }

    const apiRef = webhookValue(body, "api_ref");
    const invoiceId = webhookValue(body, "invoice_id");
    const reference = typeof apiRef === "string" ? apiRef.trim() : "";
    const providerTransactionId = typeof invoiceId === "string" ? invoiceId.trim() : "";
    if (!reference && !providerTransactionId) {
      return void res.status(400).json({ error: "Missing payment reference." });
    }

    const conditions: SQL[] = [];
    if (reference) conditions.push(eq(depositRequests.paymentReference, reference));
    if (providerTransactionId) {
      conditions.push(eq(depositRequests.providerTransactionId, providerTransactionId));
    }

    await db.transaction(async (tx) => {
      const [deposit] = await tx
        .select()
        .from(depositRequests)
        .where(or(...conditions))
        .limit(1);

      if (!deposit || deposit.status !== "pending") return;
      if (!deposit.sessionId.startsWith("live-")) {
        throw new Error(`Unsupported deposit session: ${deposit.sessionId}`);
      }

      const traderId = Number.parseInt(deposit.sessionId.slice(5), 10);
      if (!Number.isInteger(traderId)) throw new Error("Invalid live trader session");

      // Change pending -> approved first. The conditional update makes duplicate
      // webhook deliveries idempotent before the balance increment is committed.
      const [claimed] = await tx
        .update(depositRequests)
        .set({
          status: "approved",
          reviewedAt: new Date(),
          providerTransactionId: providerTransactionId || deposit.providerTransactionId,
        })
        .where(and(eq(depositRequests.id, deposit.id), eq(depositRequests.status, "pending")))
        .returning({ id: depositRequests.id });
      if (!claimed) return;

      const [credited] = await tx
        .update(liveTraders)
        .set({ balance: sql`${liveTraders.balance} + ${deposit.amount}` })
        .where(eq(liveTraders.id, traderId))
        .returning({ id: liveTraders.id });
      if (!credited) throw new Error(`Live trader ${traderId} was not found`);
    });

    return void res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "IntaSend webhook error");
    return void res.status(500).json({ error: "Webhook processing failed." });
  }
});

export default router;