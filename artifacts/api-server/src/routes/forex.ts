import { Router } from "express";
import { randomUUID } from "crypto";
import { eq, and, desc, count, gt } from "drizzle-orm";
import { db, forexAccounts, forexPositions, forexClosedTrades } from "@workspace/db";
import { getPriceSnapshot, getCandleData, calcPnl, INSTRUMENTS } from "../lib/forex-sim";
import { adminSessions } from "../lib/admin-sessions";
import type { Request, Response } from "express";

export const OWNER_SESSION_ID = "__owner__";

const router = Router();

// ── Session helpers ──────────────────────────────────────────────────────────
// If the caller has a valid admin session, route them to the owner account.
function getSession(req: Request, res: Response): string {
  const adminToken = (req.cookies as Record<string, string>)?.adminSession;
  if (adminToken && adminSessions.has(adminToken)) {
    return OWNER_SESSION_ID;
  }
  let sid: string = (req.cookies as Record<string, string>)?.demoSession;
  if (!sid) {
    sid = randomUUID();
    res.cookie("demoSession", sid, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    });
  }
  return sid;
}

async function getOrCreateAccount(sessionId: string) {
  const existing = await db.query.forexAccounts.findFirst({
    where: eq(forexAccounts.sessionId, sessionId),
  });
  if (existing) return existing;
  const [acc] = await db.insert(forexAccounts)
    .values({ sessionId, balance: 10000 })
    .returning();
  return acc;
}

// ── GET /api/forex/prices ────────────────────────────────────────────────────
router.get("/forex/prices", (_req, res) => {
  res.json(getPriceSnapshot());
});

// ── GET /api/forex/candles/:pair ─────────────────────────────────────────────
router.get("/forex/candles/:pair", (req, res) => {
  res.json(getCandleData(req.params.pair));
});

// ── GET /api/forex/account ───────────────────────────────────────────────────
router.get("/forex/account", async (req, res) => {
  try {
    const sid = getSession(req, res);
    const account = await getOrCreateAccount(sid);
    const snap = getPriceSnapshot();

    const dbPositions = await db.select()
      .from(forexPositions)
      .where(eq(forexPositions.sessionId, sid));

    let floatingPnl = 0;
    const positions = await Promise.all(
      dbPositions.map(async (pos) => {
        const pd = snap[pos.pair];
        const cur = pd ? (pos.action === "BUY" ? pd.bid : pd.ask) : pos.currentPrice;
        const pnl = calcPnl(pos.pair, pos.action, pos.lots, pos.openPrice, cur);
        floatingPnl += pnl;
        await db.update(forexPositions)
          .set({ currentPrice: cur, pnl })
          .where(eq(forexPositions.id, pos.id));
        return {
          id: pos.id,
          pair: pos.pair,
          action: pos.action,
          lots: pos.lots,
          openPrice: pos.openPrice,
          currentPrice: cur,
          pnl,
          sl: pos.sl ?? null,
          tp: pos.tp ?? null,
          openedAt: pos.openedAt?.toISOString() ?? new Date().toISOString(),
          dec: pd?.dec ?? 5,
        };
      }),
    );

    const equity      = parseFloat((account.balance + floatingPnl).toFixed(2));
    const marginUsed  = positions.reduce((s, p) => s + p.lots * 1000, 0);
    const freeMargin  = parseFloat((equity - marginUsed).toFixed(2));
    const marginLevel = marginUsed > 0 ? parseFloat((equity / marginUsed * 100).toFixed(1)) : 0;

    const [totalRow] = await db.select({ c: count() })
      .from(forexClosedTrades).where(eq(forexClosedTrades.sessionId, sid));
    const [winRow] = await db.select({ c: count() })
      .from(forexClosedTrades)
      .where(and(eq(forexClosedTrades.sessionId, sid), gt(forexClosedTrades.pnl, 0)));

    const total = totalRow?.c ?? 0;
    const wins  = winRow?.c ?? 0;

    res.json({
      balance:      account.balance,
      equity,
      floatingPnl:  parseFloat(floatingPnl.toFixed(2)),
      marginUsed,
      freeMargin,
      marginLevel,
      totalTrades:  total,
      winRate:      total > 0 ? parseFloat((Number(wins) / Number(total) * 100).toFixed(1)) : 0,
      positions,
    });
  } catch (err) {
    req.log.error({ err }, "account error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/forex/orders ───────────────────────────────────────────────────
router.post("/forex/orders", async (req, res) => {
  try {
    const sid = getSession(req, res);
    const account = await getOrCreateAccount(sid);
    const { pair, action, lots, sl, tp } = req.body as {
      pair: string; action: string; lots: number; sl?: number | null; tp?: number | null;
    };

    if (!pair || !action || !lots) {
      return void res.status(400).json({ error: "pair, action, lots are required" });
    }
    if (!INSTRUMENTS[pair]) {
      return void res.status(400).json({ error: `Unknown pair: ${pair}` });
    }
    if (!["BUY", "SELL"].includes(action)) {
      return void res.status(400).json({ error: "action must be BUY or SELL" });
    }
    if (lots < 0.01 || lots > 10) {
      return void res.status(400).json({ error: "lots must be 0.01–10" });
    }

    const snap  = getPriceSnapshot();
    const pd    = snap[pair];
    const price = action === "BUY" ? pd.ask : pd.bid;

    await db.insert(forexPositions).values({
      sessionId: sid,
      pair,
      action,
      lots,
      openPrice: price,
      currentPrice: price,
      pnl: 0,
      sl: sl ?? null,
      tp: tp ?? null,
    });

    res.status(201).json({ ok: true, price, pair, action, lots });
  } catch (err) {
    req.log.error({ err }, "order error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── DELETE /api/forex/positions/:id ─────────────────────────────────────────
router.delete("/forex/positions/:id", async (req, res) => {
  try {
    const sid = getSession(req, res);
    const id  = parseInt(req.params.id, 10);

    const [pos] = await db.select().from(forexPositions)
      .where(and(eq(forexPositions.id, id), eq(forexPositions.sessionId, sid)));
    if (!pos) return void res.status(404).json({ error: "Position not found" });

    const snap = getPriceSnapshot();
    const pd   = snap[pos.pair];
    const cur  = pd ? (pos.action === "BUY" ? pd.bid : pd.ask) : pos.currentPrice;
    const pnl  = calcPnl(pos.pair, pos.action, pos.lots, pos.openPrice, cur);

    const account = await getOrCreateAccount(sid);
    const newBalance = parseFloat((account.balance + pnl).toFixed(2));

    await db.insert(forexClosedTrades).values({
      sessionId: sid,
      pair: pos.pair,
      action: pos.action,
      lots: pos.lots,
      openPrice: pos.openPrice,
      closePrice: cur,
      pnl,
      openedAt: pos.openedAt?.toISOString() ?? new Date().toISOString(),
    });
    await db.delete(forexPositions).where(eq(forexPositions.id, id));
    await db.update(forexAccounts)
      .set({ balance: newBalance })
      .where(eq(forexAccounts.sessionId, sid));

    res.json({ ok: true, pnl, newBalance });
  } catch (err) {
    req.log.error({ err }, "close error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── GET /api/forex/history ───────────────────────────────────────────────────
router.get("/forex/history", async (req, res) => {
  try {
    const sid = getSession(req, res);
    const trades = await db.select().from(forexClosedTrades)
      .where(eq(forexClosedTrades.sessionId, sid))
      .orderBy(desc(forexClosedTrades.closedAt))
      .limit(100);

    res.json(trades.map(t => ({
      id: t.id, pair: t.pair, action: t.action,
      lots: t.lots, openPrice: t.openPrice, closePrice: t.closePrice,
      pnl: t.pnl, openedAt: t.openedAt,
      closedAt: t.closedAt?.toISOString() ?? new Date().toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "history error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/forex/account/reset ────────────────────────────────────────────
router.post("/forex/account/reset", async (req, res) => {
  try {
    const sid = getSession(req, res);
    await db.delete(forexPositions).where(eq(forexPositions.sessionId, sid));
    await db.delete(forexClosedTrades).where(eq(forexClosedTrades.sessionId, sid));
    await db.update(forexAccounts).set({ balance: 10000 }).where(eq(forexAccounts.sessionId, sid));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "reset error");
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
