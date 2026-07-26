import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, depositRequests, forexAccounts } from "@workspace/db";
import { adminSessions } from "../lib/admin-sessions";
import type { Request, Response, NextFunction } from "express";

const router = Router();

// ── Admin auth middleware ─────────────────────────────────────────────────────
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = (req.cookies as Record<string, string>)?.adminSession;
  if (!token || !adminSessions.has(token)) {
    return void res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── POST /api/deposits  ── trader submits a deposit request ──────────────────
router.post("/deposits", async (req, res) => {
  const sid: string | undefined = (req.cookies as Record<string, string>)?.demoSession;
  if (!sid) {
    return void res
      .status(400)
      .json({ error: "No active trading session. Open the demo terminal first." });
  }

  const { traderName, contact, amount, paymentMethod, paymentReference } = req.body as Record<string, string>;
  if (!traderName?.trim() || !contact?.trim() || !paymentMethod?.trim() || !paymentReference?.trim()) {
    return void res.status(400).json({ error: "All fields are required." });
  }
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0 || amt > 1_000_000) {
    return void res.status(400).json({ error: "Enter a valid amount (1 – 1,000,000)." });
  }

  await db.insert(depositRequests).values({
    sessionId: sid,
    traderName: traderName.trim(),
    contact: contact.trim(),
    amount: amt,
    paymentMethod: paymentMethod.trim(),
    paymentReference: paymentReference.trim(),
    status: "pending",
  });

  return void res.status(201).json({ ok: true, message: "Deposit request submitted. You will be credited once the admin confirms payment." });
});

// ── GET /api/admin/deposits  ── list all requests ────────────────────────────
router.get("/admin/deposits", requireAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(depositRequests)
    .orderBy(desc(depositRequests.createdAt));
  return void res.json(rows);
});

// ── POST /api/admin/deposits/:id/approve  ── credit account ──────────────────
router.post("/admin/deposits/:id/approve", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });

  const [dep] = await db.select().from(depositRequests).where(eq(depositRequests.id, id));
  if (!dep) return void res.status(404).json({ error: "Not found" });
  if (dep.status !== "pending") return void res.status(409).json({ error: "Already reviewed" });

  // Credit the trader's account
  const [account] = await db
    .select()
    .from(forexAccounts)
    .where(eq(forexAccounts.sessionId, dep.sessionId));

  if (account) {
    await db
      .update(forexAccounts)
      .set({ balance: account.balance + dep.amount })
      .where(eq(forexAccounts.sessionId, dep.sessionId));
  }

  await db
    .update(depositRequests)
    .set({ status: "approved", reviewedAt: new Date() })
    .where(eq(depositRequests.id, id));

  return void res.json({ ok: true });
});

// ── POST /api/admin/deposits/:id/reject  ── reject request ───────────────────
router.post("/admin/deposits/:id/reject", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });

  const [dep] = await db.select().from(depositRequests).where(eq(depositRequests.id, id));
  if (!dep) return void res.status(404).json({ error: "Not found" });
  if (dep.status !== "pending") return void res.status(409).json({ error: "Already reviewed" });

  await db
    .update(depositRequests)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(eq(depositRequests.id, id));

  return void res.json({ ok: true });
});

export default router;
