/**
 * /api/real — Owner-only routes for the real trading account.
 * All routes require a valid admin session cookie.
 * The owner account uses the fixed OWNER_SESSION_ID so it's always the same account.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, forexAccounts } from "@workspace/db";
import { adminSessions } from "../lib/admin-sessions";
import { OWNER_SESSION_ID } from "./forex";
import type { Request, Response, NextFunction } from "express";

const router = Router();

const OWNER_STARTING_BALANCE = 100_000;

// ── Auth guard ────────────────────────────────────────────────────────────────
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = (req.cookies as Record<string, string>)?.adminSession;
  if (!token || !adminSessions.has(token)) {
    return void res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

async function ensureOwnerAccount() {
  const existing = await db.query.forexAccounts.findFirst({
    where: eq(forexAccounts.sessionId, OWNER_SESSION_ID),
  });
  if (existing) return existing;
  const [acc] = await db
    .insert(forexAccounts)
    .values({ sessionId: OWNER_SESSION_ID, balance: OWNER_STARTING_BALANCE })
    .returning();
  return acc;
}

// ── GET /api/real/info — confirm owner account exists and return starting balance ──
router.get("/real/info", requireAdmin, async (req, res) => {
  try {
    const acc = await ensureOwnerAccount();
    res.json({ sessionId: OWNER_SESSION_ID, balance: acc.balance, startingBalance: OWNER_STARTING_BALANCE });
  } catch (err) {
    req.log.error({ err }, "real/info error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── PATCH /api/real/balance — set owner balance to any amount ─────────────────
router.patch("/real/balance", requireAdmin, async (req, res) => {
  try {
    const { balance } = req.body as { balance?: number };
    if (typeof balance !== "number" || balance < 0 || balance > 100_000_000) {
      return void res.status(400).json({ error: "balance must be 0 – 100,000,000" });
    }
    await ensureOwnerAccount();
    await db
      .update(forexAccounts)
      .set({ balance })
      .where(eq(forexAccounts.sessionId, OWNER_SESSION_ID));
    res.json({ ok: true, balance });
  } catch (err) {
    req.log.error({ err }, "real/balance error");
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
