import { Router } from "express";
import { randomUUID } from "crypto";
import { eq, count, sum, gt, desc } from "drizzle-orm";
import { db, forexAccounts, forexPositions, forexClosedTrades, liveTraders, depositRequests, withdrawalRequests } from "@workspace/db";
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

// ── POST /api/admin/login ─────────────────────────────────────────────────────
router.post("/admin/login", (req, res) => {
  const { password } = req.body as { password?: string };
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return void res.status(503).json({
      error: "Admin access not configured. Set the ADMIN_PASSWORD secret in your Replit project.",
    });
  }
  if (!password || password !== adminPassword) {
    return void res.status(401).json({ error: "Incorrect password." });
  }

  const token = randomUUID();
  adminSessions.add(token);
  res.cookie("adminSession", token, {
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    sameSite: "lax",
  });
  res.json({ ok: true });
});

// ── POST /api/admin/logout ────────────────────────────────────────────────────
router.post("/admin/logout", (req, res) => {
  const token = (req.cookies as Record<string, string>)?.adminSession;
  if (token) adminSessions.delete(token);
  res.clearCookie("adminSession");
  res.json({ ok: true });
});

// ── GET /api/admin/me ─────────────────────────────────────────────────────────
router.get("/admin/me", (req, res) => {
  const token = (req.cookies as Record<string, string>)?.adminSession;
  res.json({ admin: !!token && adminSessions.has(token) });
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    const [acctRow]  = await db.select({ c: count() }).from(forexAccounts);
    const [posRow]   = await db.select({ c: count() }).from(forexPositions);
    const [tradeRow] = await db.select({ c: count(), totalPnl: sum(forexClosedTrades.pnl) }).from(forexClosedTrades);
    const [winRow]   = await db.select({ c: count() }).from(forexClosedTrades).where(gt(forexClosedTrades.pnl, 0));

    const totalTrades = Number(tradeRow?.c ?? 0);
    const wins        = Number(winRow?.c ?? 0);

    res.json({
      totalAccounts: Number(acctRow?.c ?? 0),
      openPositions: Number(posRow?.c ?? 0),
      totalTrades,
      totalPnl:      parseFloat(Number(tradeRow?.totalPnl ?? 0).toFixed(2)),
      winRate:       totalTrades > 0 ? parseFloat((wins / totalTrades * 100).toFixed(1)) : 0,
    });
  } catch (err) {
    req.log.error({ err }, "admin/stats error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── GET /api/admin/accounts ───────────────────────────────────────────────────
router.get("/admin/accounts", requireAdmin, async (req, res) => {
  try {
    const accounts = await db.select().from(forexAccounts).orderBy(forexAccounts.id);

    const enriched = await Promise.all(
      accounts.map(async (acc) => {
        const sid = acc.sessionId;
        const [posRow]   = await db.select({ c: count() }).from(forexPositions).where(eq(forexPositions.sessionId, sid));
        const [tradeRow] = await db.select({ c: count(), pnl: sum(forexClosedTrades.pnl) })
          .from(forexClosedTrades).where(eq(forexClosedTrades.sessionId, sid));
        const [winRow]   = await db.select({ c: count() }).from(forexClosedTrades)
          .where(eq(forexClosedTrades.sessionId, sid));

        const totalTrades = Number(tradeRow?.c ?? 0);
        const netPnl      = parseFloat(Number(tradeRow?.pnl ?? 0).toFixed(2));

        return {
          id:            acc.id,
          sessionId:     acc.sessionId,
          balance:       acc.balance,
          createdAt:     acc.createdAt?.toISOString() ?? null,
          openPositions: Number(posRow?.c ?? 0),
          totalTrades,
          netPnl,
          winRate:       totalTrades > 0
            ? parseFloat((Number(winRow?.c ?? 0) / totalTrades * 100).toFixed(1))
            : 0,
        };
      }),
    );

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "admin/accounts error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/admin/accounts/:id/reset ───────────────────────────────────────
router.post("/admin/accounts/:id/reset", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [acc] = await db.select().from(forexAccounts).where(eq(forexAccounts.id, id));
    if (!acc) return void res.status(404).json({ error: "Account not found" });

    await db.delete(forexPositions).where(eq(forexPositions.sessionId, acc.sessionId));
    await db.delete(forexClosedTrades).where(eq(forexClosedTrades.sessionId, acc.sessionId));
    await db.update(forexAccounts).set({ balance: 10000 }).where(eq(forexAccounts.id, id));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "admin/reset error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── PATCH /api/admin/accounts/:id/balance ────────────────────────────────────
router.patch("/admin/accounts/:id/balance", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { balance } = req.body as { balance?: number };
    if (typeof balance !== "number" || balance < 0 || balance > 10_000_000) {
      return void res.status(400).json({ error: "balance must be 0–10,000,000" });
    }
    const [acc] = await db.select().from(forexAccounts).where(eq(forexAccounts.id, id));
    if (!acc) return void res.status(404).json({ error: "Account not found" });

    await db.update(forexAccounts).set({ balance }).where(eq(forexAccounts.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "admin/balance error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── DELETE /api/admin/accounts/:id ───────────────────────────────────────────
router.delete("/admin/accounts/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [acc] = await db.select().from(forexAccounts).where(eq(forexAccounts.id, id));
    if (!acc) return void res.status(404).json({ error: "Account not found" });

    await db.delete(forexPositions).where(eq(forexPositions.sessionId, acc.sessionId));
    await db.delete(forexClosedTrades).where(eq(forexClosedTrades.sessionId, acc.sessionId));
    await db.delete(forexAccounts).where(eq(forexAccounts.id, id));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "admin/delete error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── GET /api/admin/live-traders ───────────────────────────────────────────────
router.get("/admin/live-traders", requireAdmin, async (req, res) => {
  try {
    const traders = await db.select().from(liveTraders).orderBy(desc(liveTraders.createdAt));
    const enriched = await Promise.all(traders.map(async (t) => {
      const sid = `live-${t.id}`;
      const [posRow]   = await db.select({ c: count() }).from(forexPositions).where(eq(forexPositions.sessionId, sid));
      const [tradeRow] = await db.select({ c: count(), pnl: sum(forexClosedTrades.pnl) }).from(forexClosedTrades).where(eq(forexClosedTrades.sessionId, sid));
      const [winRow]   = await db.select({ c: count() }).from(forexClosedTrades).where(eq(forexClosedTrades.sessionId, sid)).where(gt(forexClosedTrades.pnl, 0));
      const [depRow]   = await db.select({ c: count() }).from(depositRequests).where(eq(depositRequests.sessionId, sid)).where(eq(depositRequests.status, "pending"));
      const totalTrades = Number(tradeRow?.c ?? 0);
      const wins        = Number(winRow?.c ?? 0);
      return {
        id: t.id, email: t.email, fullName: t.fullName, balance: t.balance,
        createdAt: t.createdAt,
        openPositions:  Number(posRow?.c ?? 0),
        totalTrades,
        netPnl:         parseFloat(Number(tradeRow?.pnl ?? 0).toFixed(2)),
        winRate:        totalTrades > 0 ? parseFloat((wins / totalTrades * 100).toFixed(1)) : 0,
        pendingDeposits: Number(depRow?.c ?? 0),
      };
    }));
    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "admin/live-traders error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── PATCH /api/admin/live-traders/:id/balance ─────────────────────────────────
router.patch("/admin/live-traders/:id/balance", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { balance } = req.body as { balance?: number };
    if (typeof balance !== "number" || balance < 0 || balance > 10_000_000) {
      return void res.status(400).json({ error: "balance must be 0–10,000,000" });
    }
    const [trader] = await db.select().from(liveTraders).where(eq(liveTraders.id, id));
    if (!trader) return void res.status(404).json({ error: "Trader not found" });
    await db.update(liveTraders).set({ balance }).where(eq(liveTraders.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "admin/live-traders balance error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── DELETE /api/admin/live-traders/:id ────────────────────────────────────────
router.delete("/admin/live-traders/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [trader] = await db.select().from(liveTraders).where(eq(liveTraders.id, id));
    if (!trader) return void res.status(404).json({ error: "Trader not found" });
    const sid = `live-${id}`;
    await db.delete(forexPositions).where(eq(forexPositions.sessionId, sid));
    await db.delete(forexClosedTrades).where(eq(forexClosedTrades.sessionId, sid));
    await db.delete(liveTraders).where(eq(liveTraders.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "admin/live-traders delete error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── GET /api/admin/withdrawals ────────────────────────────────────────────────
router.get("/admin/withdrawals", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(withdrawalRequests).orderBy(desc(withdrawalRequests.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "admin/withdrawals error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/admin/withdrawals/:id/approve ───────────────────────────────────
router.post("/admin/withdrawals/:id/approve", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { note } = req.body as { note?: string };
    const [wr] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, id));
    if (!wr) return void res.status(404).json({ error: "Request not found" });
    if (wr.status !== "pending") return void res.status(400).json({ error: "Already reviewed" });

    // Parse traderId from sessionId (live-{id})
    const traderId = parseInt(wr.sessionId.replace("live-", ""), 10);
    const [trader] = await db.select().from(liveTraders).where(eq(liveTraders.id, traderId));
    if (!trader) return void res.status(404).json({ error: "Trader not found" });

    if (wr.amount > trader.balance) {
      return void res.status(400).json({ error: `Trader balance ($${trader.balance.toFixed(2)}) is less than withdrawal amount ($${wr.amount.toFixed(2)}).` });
    }

    const newBalance = parseFloat((trader.balance - wr.amount).toFixed(2));
    await db.update(liveTraders).set({ balance: newBalance }).where(eq(liveTraders.id, traderId));
    await db.update(withdrawalRequests).set({
      status: "approved",
      note: note?.trim() || null,
      reviewedAt: new Date(),
    }).where(eq(withdrawalRequests.id, id));

    res.json({ ok: true, newBalance });
  } catch (err) {
    req.log.error({ err }, "admin/withdrawals approve error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/admin/withdrawals/:id/reject ────────────────────────────────────
router.post("/admin/withdrawals/:id/reject", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { note } = req.body as { note?: string };
    const [wr] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, id));
    if (!wr) return void res.status(404).json({ error: "Request not found" });
    if (wr.status !== "pending") return void res.status(400).json({ error: "Already reviewed" });

    await db.update(withdrawalRequests).set({
      status: "rejected",
      note: note?.trim() || null,
      reviewedAt: new Date(),
    }).where(eq(withdrawalRequests.id, id));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "admin/withdrawals reject error");
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
