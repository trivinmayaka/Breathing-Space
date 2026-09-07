import { Router } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { eq, and, desc, count, gt, sum } from "drizzle-orm";
import {
  db, liveTraders, forexPositions, forexClosedTrades, depositRequests, withdrawalRequests,
} from "@workspace/db";
import { desc as descOrder } from "drizzle-orm";
import { getPriceSnapshot, getCandleData, calcPnl, calcMargin, INSTRUMENTS } from "../lib/forex-sim";
import { randomUUID } from "crypto";
import {
  initiateMpesaStkPush,
  isIntaSendConfigured,
  normalizeKenyanPhone,
  getProviderTransactionId,
} from "../lib/intasend";
import type { Request, Response, NextFunction } from "express";

const scryptAsync = promisify(scrypt);
const router = Router();
const ETHEREUM_TX_HASH = /^0x[a-fA-F0-9]{64}$/;

// ── Password helpers ──────────────────────────────────────────────────────────
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, storedHash] = stored.split(":");
  if (!salt || !storedHash) return false;
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedBuf = Buffer.from(storedHash, "hex");
  if (hash.length !== storedBuf.length) return false;
  return timingSafeEqual(hash, storedBuf);
}

// ── Session helpers ───────────────────────────────────────────────────────────
function getLiveTraderId(req: Request): number | null {
  const raw = (req.cookies as Record<string, string>)?.liveSession;
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return isNaN(id) ? null : id;
}

function liveSessionId(traderId: number): string {
  return `live-${traderId}`;
}

// ── Auth middleware ───────────────────────────────────────────────────────────
async function requireLive(req: Request, res: Response, next: NextFunction) {
  const id = getLiveTraderId(req);
  if (!id) return void res.status(401).json({ error: "Not logged in" });
  const trader = await db.query.liveTraders.findFirst({ where: eq(liveTraders.id, id) });
  if (!trader) return void res.status(401).json({ error: "Not logged in" });
  (req as any).liveTrader = trader;
  next();
}

// ── POST /api/live/register ───────────────────────────────────────────────────
router.post("/live/register", async (req, res) => {
  try {
    const { email, password, fullName } = req.body as Record<string, string>;
    if (!email?.trim() || !password || !fullName?.trim()) {
      return void res.status(400).json({ error: "Email, full name, and password are required." });
    }
    if (password.length < 6) {
      return void res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    const emailLower = email.trim().toLowerCase();
    const existing = await db.query.liveTraders.findFirst({ where: eq(liveTraders.email, emailLower) });
    if (existing) return void res.status(409).json({ error: "An account with this email already exists." });

    const passwordHash = await hashPassword(password);
    const [trader] = await db.insert(liveTraders).values({
      email: emailLower,
      passwordHash,
      fullName: fullName.trim(),
      balance: 0,
    }).returning();

    res.cookie("liveSession", String(trader.id), {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    });
    return void res.status(201).json({ ok: true, traderId: trader.id, email: trader.email, fullName: trader.fullName });
  } catch (err) {
    req.log.error({ err }, "live/register error");
    return void res.status(500).json({ error: "Registration failed." });
  }
});

// ── POST /api/live/login ──────────────────────────────────────────────────────
router.post("/live/login", async (req, res) => {
  try {
    const { email, password } = req.body as Record<string, string>;
    if (!email?.trim() || !password) {
      return void res.status(400).json({ error: "Email and password are required." });
    }
    const emailLower = email.trim().toLowerCase();
    const trader = await db.query.liveTraders.findFirst({ where: eq(liveTraders.email, emailLower) });
    if (!trader) return void res.status(401).json({ error: "Invalid email or password." });

    const ok = await verifyPassword(password, trader.passwordHash);
    if (!ok) return void res.status(401).json({ error: "Invalid email or password." });

    res.cookie("liveSession", String(trader.id), {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    });
    return void res.json({ ok: true, traderId: trader.id, email: trader.email, fullName: trader.fullName });
  } catch (err) {
    req.log.error({ err }, "live/login error");
    return void res.status(500).json({ error: "Login failed." });
  }
});

// ── POST /api/live/logout ─────────────────────────────────────────────────────
router.post("/live/logout", (req, res) => {
  res.clearCookie("liveSession");
  return void res.json({ ok: true });
});

// ── GET /api/live/me ──────────────────────────────────────────────────────────
router.get("/live/me", async (req, res) => {
  const id = getLiveTraderId(req);
  if (!id) return void res.json({ loggedIn: false });
  const trader = await db.query.liveTraders.findFirst({ where: eq(liveTraders.id, id) });
  if (!trader) return void res.json({ loggedIn: false });
  return void res.json({ loggedIn: true, traderId: trader.id, email: trader.email, fullName: trader.fullName });
});

// ── Helper: close a position at a given price, updating balance ───────────────
async function closePositionAtPrice(
  traderId: number,
  currentBalance: number,
  sid: string,
  pos: {
    id: number; pair: string; action: string; lots: number; openPrice: number;
    openedAt: Date | null; commission?: number; swap?: number;
  },
  closePrice: number,
  closeReason = "manual",
): Promise<number> {
  const pnl = calcPnl(pos.pair, pos.action, pos.lots, pos.openPrice, closePrice);
  const newBalance = parseFloat((currentBalance + pnl).toFixed(2));
  await db.delete(forexPositions).where(eq(forexPositions.id, pos.id));
  await db.insert(forexClosedTrades).values({
    sessionId: sid, pair: pos.pair, action: pos.action, lots: pos.lots,
    openPrice: pos.openPrice, closePrice, pnl,
    commission: pos.commission ?? 0,
    swap: pos.swap ?? 0,
    closeReason,
    openedAt: pos.openedAt?.toISOString() ?? new Date().toISOString(),
  });
  await db.update(liveTraders).set({ balance: newBalance }).where(eq(liveTraders.id, traderId));
  return newBalance;
}

// ── GET /api/live/account ─────────────────────────────────────────────────────
router.get("/live/account", requireLive, async (req, res) => {
  try {
    let trader = (req as any).liveTrader as { id: number; balance: number };
    const sid = liveSessionId(trader.id);
    const snap = getPriceSnapshot();

    const dbPositions = await db.select().from(forexPositions).where(eq(forexPositions.sessionId, sid));

    let runningBalance = trader.balance;
    let floatingPnl = 0;
    const pendingOrders: Array<{
      id: number; pair: string; action: string; lots: number;
      orderType: string; triggerPrice: number | null; sl: number | null;
      tp: number | null; trailingStopPips: number | null; leverage: number;
      currentPrice: number; createdAt: string;
    }> = [];
    const openPositions: Array<{
      id: number; pair: string; action: string; lots: number;
      openPrice: number; currentPrice: number; pnl: number;
      sl: number | null; tp: number | null;
      trailingStopPips: number | null; leverage: number;
      commission: number; swap: number; openedAt: string; dec: number;
    }> = [];

    for (const pos of dbPositions) {
      const pd  = snap[pos.pair];
      if (!pd) continue;

      const marketMid = pd.mid;
      const trigger = pos.triggerPrice ?? pos.openPrice;
      const isPending = pos.status === "pending";
      const triggered = !isPending || (
        pos.orderType === "limit"
          ? (pos.action === "BUY" ? marketMid <= trigger : marketMid >= trigger)
          : (pos.action === "BUY" ? marketMid >= trigger : marketMid <= trigger)
      );

      if (isPending && !triggered) {
        pendingOrders.push({
          id: pos.id, pair: pos.pair, action: pos.action, lots: pos.lots,
          orderType: pos.orderType, triggerPrice: pos.triggerPrice,
          sl: pos.sl ?? null, tp: pos.tp ?? null,
          trailingStopPips: pos.trailingStopPips ?? null,
          leverage: pos.leverage, currentPrice: marketMid,
          createdAt: pos.openedAt?.toISOString() ?? new Date().toISOString(),
        });
        continue;
      }

      const cur = pos.action === "BUY" ? pd.bid : pd.ask;
      if (isPending) {
        await db.update(forexPositions).set({
          status: "open", openPrice: cur, currentPrice: cur,
        }).where(eq(forexPositions.id, pos.id));
      }
      const activePos = isPending ? { ...pos, openPrice: cur, currentPrice: cur, status: "open" } : pos;

      let activeSl = pos.sl;
      if (pos.trailingStopPips != null && pos.trailingStopPips > 0) {
        const trailing = pos.action === "BUY"
          ? cur - pos.trailingStopPips * pd.pip
          : cur + pos.trailingStopPips * pd.pip;
        activeSl = activeSl == null
          ? trailing
          : pos.action === "BUY" ? Math.max(activeSl, trailing) : Math.min(activeSl, trailing);
        if (activeSl !== pos.sl) {
          await db.update(forexPositions).set({ sl: activeSl }).where(eq(forexPositions.id, pos.id));
        }
      }
      const pnl = calcPnl(activePos.pair, activePos.action, activePos.lots, activePos.openPrice, cur);

      // ── SL trigger ──
      const slHit = activeSl != null && (
        (pos.action === "BUY"  && cur <= activeSl) ||
        (pos.action === "SELL" && cur >= activeSl)
      );
      // ── TP trigger ──
      const tpHit = pos.tp != null && (
        (pos.action === "BUY"  && cur >= pos.tp) ||
        (pos.action === "SELL" && cur <= pos.tp)
      );

      if (slHit || tpHit) {
        // Close at current market price (SL/TP fill)
        runningBalance = await closePositionAtPrice(
          trader.id, runningBalance, sid, activePos, cur, slHit ? "stop_loss" : "take_profit",
        );
        req.log.info({ posId: pos.id, pair: pos.pair, reason: slHit ? "SL" : "TP", closePrice: cur }, "SL/TP triggered");
        continue; // position is closed; exclude from open list
      }

      // Position stays open — update live price/pnl in DB
      await db.update(forexPositions).set({ currentPrice: cur, pnl }).where(eq(forexPositions.id, pos.id));
      floatingPnl += pnl;
      openPositions.push({
        id: pos.id, pair: pos.pair, action: pos.action, lots: pos.lots,
        openPrice: activePos.openPrice, currentPrice: cur, pnl,
        sl: activeSl ?? null, tp: pos.tp ?? null,
        trailingStopPips: pos.trailingStopPips ?? null,
        leverage: pos.leverage, commission: pos.commission, swap: pos.swap,
        openedAt: pos.openedAt?.toISOString() ?? new Date().toISOString(),
        dec: pd.dec,
      });
    }

    const equity      = parseFloat((runningBalance + floatingPnl).toFixed(2));
    const marginUsed  = openPositions.reduce((s, p) => {
      const pd = snap[p.pair];
      return s + calcMargin(p.pair, p.lots, pd?.mid ?? p.currentPrice, p.leverage);
    }, 0);
    const freeMargin  = parseFloat((equity - marginUsed).toFixed(2));
    const marginLevel = marginUsed > 0 ? parseFloat((equity / marginUsed * 100).toFixed(1)) : 0;

    const [totalRow] = await db.select({ c: count() }).from(forexClosedTrades).where(eq(forexClosedTrades.sessionId, sid));
    const [winRow]   = await db.select({ c: count() }).from(forexClosedTrades).where(and(eq(forexClosedTrades.sessionId, sid), gt(forexClosedTrades.pnl, 0)));
    const [pnlRow]   = await db.select({ total: sum(forexClosedTrades.pnl) }).from(forexClosedTrades).where(eq(forexClosedTrades.sessionId, sid));

    const total = Number(totalRow?.c ?? 0);
    const wins  = Number(winRow?.c ?? 0);

    return void res.json({
      balance: runningBalance, equity, floatingPnl: parseFloat(floatingPnl.toFixed(2)),
      marginUsed, freeMargin, marginLevel,
      totalTrades: total,
      winRate: total > 0 ? parseFloat((wins / total * 100).toFixed(1)) : 0,
      realizedPnl: parseFloat(Number(pnlRow?.total ?? 0).toFixed(2)),
      positions: openPositions,
      pendingOrders,
      marketData: { source: "simulated", status: "practice-only" },
    });
  } catch (err) {
    req.log.error({ err }, "live/account error");
    return void res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/live/orders ─────────────────────────────────────────────────────
router.post("/live/orders", requireLive, async (req, res) => {
  try {
    const trader = (req as any).liveTrader as { id: number; balance: number };
    const sid = liveSessionId(trader.id);

    const { pair, action, lots, sl, tp, orderType = "market", triggerPrice, trailingStopPips, leverage = 100 } = req.body as {
      pair: string; action: string; lots: number; sl?: number | null; tp?: number | null;
      orderType?: string; triggerPrice?: number | null; trailingStopPips?: number | null; leverage?: number;
    };

    if (!pair || !action || !lots) return void res.status(400).json({ error: "pair, action, lots required" });
    if (!INSTRUMENTS[pair]) return void res.status(400).json({ error: `Unknown pair: ${pair}` });
    if (!["BUY", "SELL"].includes(action)) return void res.status(400).json({ error: "action must be BUY or SELL" });
    if (lots < 0.01 || lots > 100) return void res.status(400).json({ error: "lots must be 0.01–100" });
    if (trader.balance <= 0) return void res.status(400).json({ error: "Insufficient balance. Please make a deposit." });
    if (!["market", "limit", "stop"].includes(orderType)) {
      return void res.status(400).json({ error: "orderType must be market, limit, or stop" });
    }
    if (![25, 50, 100, 200].includes(Number(leverage))) {
      return void res.status(400).json({ error: "Leverage must be 1:25, 1:50, 1:100, or 1:200" });
    }

    const snap  = getPriceSnapshot();
    const pd    = snap[pair];
    const marketPrice = action === "BUY" ? pd.ask : pd.bid;
    const requestedTrigger = triggerPrice == null ? null : Number(triggerPrice);
    const price = orderType === "market" ? marketPrice : requestedTrigger;
    if (orderType !== "market" && (!requestedTrigger || !isFinite(requestedTrigger) || requestedTrigger <= 0)) {
      return void res.status(400).json({ error: "A valid trigger price is required for pending orders." });
    }
    if (orderType === "limit" && (
      (action === "BUY" && requestedTrigger! >= marketPrice) ||
      (action === "SELL" && requestedTrigger! <= marketPrice)
    )) {
      return void res.status(400).json({ error: "Limit orders must be placed away from the current market price." });
    }
    if (orderType === "stop" && (
      (action === "BUY" && requestedTrigger! <= marketPrice) ||
      (action === "SELL" && requestedTrigger! >= marketPrice)
    )) {
      return void res.status(400).json({ error: "Stop orders must be placed beyond the current market price." });
    }
    const referencePrice = price!;

    // ── SL/TP validation ──────────────────────────────────────────────────────
    if (sl != null) {
      if (!isFinite(sl) || sl <= 0) return void res.status(400).json({ error: "Stop Loss must be a positive finite number." });
      // For a BUY, SL must be below the entry price; for SELL, above.
      if (action === "BUY"  && sl >= referencePrice) return void res.status(400).json({ error: `Stop Loss (${sl}) must be below the entry price (${referencePrice.toFixed(pd.dec)}) for a BUY order.` });
      if (action === "SELL" && sl <= referencePrice) return void res.status(400).json({ error: `Stop Loss (${sl}) must be above the entry price (${referencePrice.toFixed(pd.dec)}) for a SELL order.` });
    }
    if (tp != null) {
      if (!isFinite(tp) || tp <= 0) return void res.status(400).json({ error: "Take Profit must be a positive finite number." });
      // For a BUY, TP must be above the entry price; for SELL, below.
      if (action === "BUY"  && tp <= referencePrice) return void res.status(400).json({ error: `Take Profit (${tp}) must be above the entry price (${referencePrice.toFixed(pd.dec)}) for a BUY order.` });
      if (action === "SELL" && tp >= referencePrice) return void res.status(400).json({ error: `Take Profit (${tp}) must be below the entry price (${referencePrice.toFixed(pd.dec)}) for a SELL order.` });
    }
    if (trailingStopPips != null && (!isFinite(trailingStopPips) || trailingStopPips <= 0)) {
      return void res.status(400).json({ error: "Trailing stop must be a positive number of pips." });
    }

    await db.insert(forexPositions).values({
      sessionId: sid, pair, action, lots, orderType,
      status: orderType === "market" ? "open" : "pending",
      openPrice: price!, triggerPrice: requestedTrigger, currentPrice: marketPrice, pnl: 0,
      sl: sl ?? null, tp: tp ?? null, trailingStopPips: trailingStopPips ?? null,
      leverage: Number(leverage), commission: 0, swap: 0,
    });

    return void res.status(201).json({ ok: true, status: orderType === "market" ? "open" : "pending", price, pair, action, lots });
  } catch (err) {
    req.log.error({ err }, "live/orders error");
    return void res.status(500).json({ error: "Failed" });
  }
});

// ── DELETE /api/live/positions/:id ───────────────────────────────────────────
router.delete("/live/positions/:id", requireLive, async (req, res) => {
  try {
    const trader = (req as any).liveTrader as { id: number; balance: number };
    const sid = liveSessionId(trader.id);
    const id  = parseInt(String(req.params.id), 10);

    const [pos] = await db.select().from(forexPositions)
      .where(and(eq(forexPositions.id, id), eq(forexPositions.sessionId, sid)));
    if (!pos) return void res.status(404).json({ error: "Position not found" });
    if (pos.status === "pending") {
      await db.delete(forexPositions).where(eq(forexPositions.id, id));
      return void res.json({ ok: true, cancelled: true });
    }

    const snap = getPriceSnapshot();
    const pd   = snap[pos.pair];
    const cur  = pd ? (pos.action === "BUY" ? pd.bid : pd.ask) : pos.currentPrice;
    const pnl  = calcPnl(pos.pair, pos.action, pos.lots, pos.openPrice, cur);
    const newBalance = parseFloat((trader.balance + pnl).toFixed(2));

    await db.delete(forexPositions).where(eq(forexPositions.id, id));
    await db.insert(forexClosedTrades).values({
      sessionId: sid, pair: pos.pair, action: pos.action, lots: pos.lots,
      openPrice: pos.openPrice, closePrice: cur, pnl,
      commission: pos.commission,
      swap: pos.swap,
      closeReason: "manual",
      openedAt: pos.openedAt?.toISOString() ?? new Date().toISOString(),
    });
    await db.update(liveTraders).set({ balance: newBalance }).where(eq(liveTraders.id, trader.id));

    return void res.json({ ok: true, pnl: parseFloat(pnl.toFixed(2)), newBalance });
  } catch (err) {
    req.log.error({ err }, "live/positions delete error");
    return void res.status(500).json({ error: "Failed" });
  }
});

// ── PATCH /api/live/positions/:id ─────────────────────────────────────────────
router.patch("/live/positions/:id", requireLive, async (req, res) => {
  try {
    const trader = (req as any).liveTrader as { id: number };
    const sid = liveSessionId(trader.id);
    const id = parseInt(String(req.params.id), 10);
    const [pos] = await db.select().from(forexPositions)
      .where(and(eq(forexPositions.id, id), eq(forexPositions.sessionId, sid)));
    if (!pos) return void res.status(404).json({ error: "Position not found" });
    if (pos.status !== "open") return void res.status(400).json({ error: "Pending orders can only be cancelled." });

    const snap = getPriceSnapshot();
    const pd = snap[pos.pair];
    const current = pos.action === "BUY" ? pd.bid : pd.ask;
    const body = req.body as { sl?: number | null; tp?: number | null; trailingStopPips?: number | null };
    const nextSl = body.sl === undefined ? pos.sl : body.sl;
    const nextTp = body.tp === undefined ? pos.tp : body.tp;
    const nextTrailing = body.trailingStopPips === undefined ? pos.trailingStopPips : body.trailingStopPips;
    if (nextSl != null && (!isFinite(nextSl) || nextSl <= 0 || (pos.action === "BUY" ? nextSl >= current : nextSl <= current))) {
      return void res.status(400).json({ error: "Stop Loss is invalid for the current market price." });
    }
    if (nextTp != null && (!isFinite(nextTp) || nextTp <= 0 || (pos.action === "BUY" ? nextTp <= current : nextTp >= current))) {
      return void res.status(400).json({ error: "Take Profit is invalid for the current market price." });
    }
    if (nextTrailing != null && (!isFinite(nextTrailing) || nextTrailing <= 0)) {
      return void res.status(400).json({ error: "Trailing stop must be a positive number of pips." });
    }
    await db.update(forexPositions).set({
      sl: nextSl ?? null, tp: nextTp ?? null, trailingStopPips: nextTrailing ?? null,
    }).where(eq(forexPositions.id, id));
    return void res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "live/positions patch error");
    return void res.status(500).json({ error: "Failed to update position." });
  }
});

// ── POST /api/live/positions/:id/partial-close ───────────────────────────────
router.post("/live/positions/:id/partial-close", requireLive, async (req, res) => {
  try {
    const trader = (req as any).liveTrader as { id: number; balance: number };
    const sid = liveSessionId(trader.id);
    const id = parseInt(String(req.params.id), 10);
    const [pos] = await db.select().from(forexPositions)
      .where(and(eq(forexPositions.id, id), eq(forexPositions.sessionId, sid)));
    if (!pos || pos.status !== "open") return void res.status(404).json({ error: "Open position not found" });
    const amount = Number((req.body as { lots?: number }).lots);
    if (!isFinite(amount) || amount < 0.01 || amount >= pos.lots) {
      return void res.status(400).json({ error: `Enter between 0.01 and ${(pos.lots - 0.01).toFixed(2)} lots.` });
    }
    const snap = getPriceSnapshot();
    const pd = snap[pos.pair];
    const closePrice = pos.action === "BUY" ? pd.bid : pd.ask;
    const pnl = calcPnl(pos.pair, pos.action, amount, pos.openPrice, closePrice);
    await db.update(forexPositions).set({ lots: parseFloat((pos.lots - amount).toFixed(2)) }).where(eq(forexPositions.id, id));
    await db.insert(forexClosedTrades).values({
      sessionId: sid, pair: pos.pair, action: pos.action, lots: amount,
      openPrice: pos.openPrice, closePrice, pnl,
      commission: 0, swap: 0, closeReason: "partial",
      openedAt: pos.openedAt?.toISOString() ?? new Date().toISOString(),
    });
    await db.update(liveTraders).set({ balance: parseFloat((trader.balance + pnl).toFixed(2)) }).where(eq(liveTraders.id, trader.id));
    return void res.json({ ok: true, pnl: parseFloat(pnl.toFixed(2)) });
  } catch (err) {
    req.log.error({ err }, "live/positions partial close error");
    return void res.status(500).json({ error: "Failed to partially close position." });
  }
});

// ── GET /api/live/history ─────────────────────────────────────────────────────
router.get("/live/history", requireLive, async (req, res) => {
  try {
    const trader = (req as any).liveTrader as { id: number };
    const sid = liveSessionId(trader.id);
    const rows = await db.select().from(forexClosedTrades)
      .where(eq(forexClosedTrades.sessionId, sid))
      .orderBy(desc(forexClosedTrades.closedAt));
    return void res.json(rows);
  } catch (err) {
    req.log.error({ err }, "live/history error");
    return void res.status(500).json({ error: "Failed" });
  }
});

// ── GET /api/live/deposits ────────────────────────────────────────────────────
router.get("/live/deposits", requireLive, async (req, res) => {
  try {
    const trader = (req as any).liveTrader as { id: number };
    const rows = await db.select().from(depositRequests)
      .where(eq(depositRequests.sessionId, liveSessionId(trader.id)))
      .orderBy(desc(depositRequests.createdAt));
    return void res.json(rows);
  } catch (err) {
    req.log.error({ err }, "live/deposits error");
    return void res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/live/deposit ────────────────────────────────────────────────────
router.post("/live/deposit", requireLive, async (req, res) => {
  try {
    const trader = (req as any).liveTrader as { id: number; email: string; fullName: string };
    const { amount, paymentMethod, paymentReference, contact, phoneNumber } =
      req.body as Record<string, string>;

    if (!paymentMethod?.trim()) {
      return void res.status(400).json({ error: "Payment method is required." });
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0 || amt > 1_000_000) {
      return void res.status(400).json({ error: "Enter a valid amount (1 – 1,000,000)." });
    }

    const normalizedMethod = paymentMethod.trim().toLowerCase();

    if (normalizedMethod === "crypto") {
      const txHash = paymentReference?.trim() ?? "";
      if (!ETHEREUM_TX_HASH.test(txHash)) {
        return void res.status(400).json({
          error: "Enter a valid Ethereum transaction hash beginning with 0x.",
        });
      }

      const [duplicate] = await db
        .select({ id: depositRequests.id, status: depositRequests.status })
        .from(depositRequests)
        .where(eq(depositRequests.paymentReference, txHash))
        .limit(1);
      if (duplicate) {
        return void res.status(409).json({
          error: `This transaction has already been submitted with status ${duplicate.status}.`,
        });
      }

      await db.insert(depositRequests).values({
        sessionId: liveSessionId(trader.id),
        traderName: trader.fullName,
        contact: contact?.trim() || "Ethereum wallet",
        amount: amt,
        paymentMethod: "Crypto (Ethereum / ERC20)",
        paymentReference: txHash,
        paymentProvider: "manual-crypto",
        status: "pending",
      });

      return void res.status(202).json({
        ok: true,
        status: "pending",
        message: "Ethereum deposit submitted for manual verification. Your trading balance will not change until an admin confirms the transaction.",
        reference: txHash,
      });
    }

    if (normalizedMethod !== "m-pesa") {
      return void res.status(422).json({
        error: "This funding method is not available yet. Deposits currently use verified M-Pesa or manual Ethereum review.",
      });
    }

    if (!isIntaSendConfigured()) {
      return void res.status(503).json({
        error: "M-Pesa deposits are not configured yet. Please contact support.",
      });
    }

    const normalizedPhone = normalizeKenyanPhone(phoneNumber ?? contact ?? "");
    if (!normalizedPhone) {
      return void res.status(400).json({
        error: "Enter a valid Kenyan M-Pesa number, such as 0712345678.",
      });
    }

    const apiRef = `trader-${trader.id}-deposit-${randomUUID()}`;
    const stk = await initiateMpesaStkPush({
      amount: amt,
      phoneNumber: normalizedPhone,
      apiRef,
    });
    const providerTransactionId = getProviderTransactionId(stk);

    await db.insert(depositRequests).values({
      sessionId: liveSessionId(trader.id),
      traderName: trader.fullName,
      contact: normalizedPhone,
      amount: amt,
      paymentMethod: "M-Pesa",
      paymentReference: apiRef,
      paymentProvider: "intasend",
      providerTransactionId,
      status: "pending",
    });

    return void res.status(202).json({
      ok: true,
      status: "pending",
      message: `Approve the M-Pesa prompt sent to ${normalizedPhone}. Your trading balance will update automatically after payment confirmation.`,
      reference: apiRef,
    });
  } catch (err) {
    req.log.error({ err }, "live/deposit error");
    return void res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/live/withdraw ───────────────────────────────────────────────────
router.post("/live/withdraw", requireLive, async (req, res) => {
  try {
    const trader = (req as any).liveTrader as { id: number; fullName: string; balance: number };
    const { amount, paymentMethod, accountDetails } = req.body as Record<string, string>;

    if (!paymentMethod?.trim() || !accountDetails?.trim()) {
      return void res.status(400).json({ error: "Payment method and account details are required." });
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return void res.status(400).json({ error: "Enter a valid withdrawal amount." });
    }
    if (paymentMethod.trim().toLowerCase() !== "m-pesa") {
      return void res.status(422).json({
        error: "This withdrawal method is not available yet. Withdrawals currently use M-Pesa only.",
      });
    }
    if (amt > trader.balance) {
      return void res.status(400).json({ error: `Insufficient balance. Your balance is $${trader.balance.toFixed(2)}.` });
    }

    // Check for existing pending withdrawal
    const existing = await db.query.withdrawalRequests.findFirst({
      where: and(eq(withdrawalRequests.sessionId, liveSessionId(trader.id)), eq(withdrawalRequests.status, "pending")),
    });
    if (existing) {
      return void res.status(409).json({ error: "You already have a pending withdrawal request. Please wait for it to be reviewed." });
    }

    await db.insert(withdrawalRequests).values({
      sessionId:      liveSessionId(trader.id),
      traderName:     trader.fullName,
      amount:         amt,
      paymentMethod:  paymentMethod.trim(),
      accountDetails: accountDetails.trim(),
      status:         "pending",
    });

    return void res.status(201).json({
      ok: true,
      message: "Withdrawal request submitted. Funds will be sent to your account once the admin processes it.",
    });
  } catch (err) {
    req.log.error({ err }, "live/withdraw error");
    return void res.status(500).json({ error: "Failed to submit withdrawal request." });
  }
});

// ── GET /api/live/withdrawals ─────────────────────────────────────────────────
router.get("/live/withdrawals", requireLive, async (req, res) => {
  try {
    const trader = (req as any).liveTrader as { id: number };
    const sid = liveSessionId(trader.id);
    const rows = await db.select().from(withdrawalRequests)
      .where(eq(withdrawalRequests.sessionId, sid))
      .orderBy(descOrder(withdrawalRequests.createdAt));
    return void res.json(rows);
  } catch (err) {
    req.log.error({ err }, "live/withdrawals error");
    return void res.status(500).json({ error: "Failed" });
  }
});

export default router;
