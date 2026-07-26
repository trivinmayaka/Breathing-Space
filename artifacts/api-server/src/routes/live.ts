import { Router } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { eq, and, desc, count, gt, sum } from "drizzle-orm";
import {
  db, liveTraders, forexPositions, forexClosedTrades, depositRequests,
} from "@workspace/db";
import { getPriceSnapshot, getCandleData, calcPnl, INSTRUMENTS } from "../lib/forex-sim";
import type { Request, Response, NextFunction } from "express";

const scryptAsync = promisify(scrypt);
const router = Router();

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

// ── GET /api/live/account ─────────────────────────────────────────────────────
router.get("/live/account", requireLive, async (req, res) => {
  try {
    const trader = (req as any).liveTrader as { id: number; balance: number };
    const sid = liveSessionId(trader.id);
    const snap = getPriceSnapshot();

    const dbPositions = await db.select().from(forexPositions).where(eq(forexPositions.sessionId, sid));

    let floatingPnl = 0;
    const positions = await Promise.all(
      dbPositions.map(async (pos) => {
        const pd = snap[pos.pair];
        const cur = pd ? (pos.action === "BUY" ? pd.bid : pd.ask) : pos.currentPrice;
        const pnl = calcPnl(pos.pair, pos.action, pos.lots, pos.openPrice, cur);
        floatingPnl += pnl;
        await db.update(forexPositions).set({ currentPrice: cur, pnl }).where(eq(forexPositions.id, pos.id));
        return {
          id: pos.id, pair: pos.pair, action: pos.action, lots: pos.lots,
          openPrice: pos.openPrice, currentPrice: cur, pnl,
          sl: pos.sl ?? null, tp: pos.tp ?? null,
          openedAt: pos.openedAt?.toISOString() ?? new Date().toISOString(),
          dec: pd?.dec ?? 5,
        };
      })
    );

    const equity     = parseFloat((trader.balance + floatingPnl).toFixed(2));
    const marginUsed = positions.reduce((s, p) => s + p.lots * 1000, 0);
    const freeMargin = parseFloat((equity - marginUsed).toFixed(2));
    const marginLevel = marginUsed > 0 ? parseFloat((equity / marginUsed * 100).toFixed(1)) : 0;

    const [totalRow] = await db.select({ c: count() }).from(forexClosedTrades).where(eq(forexClosedTrades.sessionId, sid));
    const [winRow]   = await db.select({ c: count() }).from(forexClosedTrades).where(and(eq(forexClosedTrades.sessionId, sid), gt(forexClosedTrades.pnl, 0)));
    const [pnlRow]   = await db.select({ total: sum(forexClosedTrades.pnl) }).from(forexClosedTrades).where(eq(forexClosedTrades.sessionId, sid));

    const total = Number(totalRow?.c ?? 0);
    const wins  = Number(winRow?.c ?? 0);

    return void res.json({
      balance: trader.balance, equity, floatingPnl: parseFloat(floatingPnl.toFixed(2)),
      marginUsed, freeMargin, marginLevel,
      totalTrades: total,
      winRate: total > 0 ? parseFloat((wins / total * 100).toFixed(1)) : 0,
      realizedPnl: parseFloat(Number(pnlRow?.total ?? 0).toFixed(2)),
      positions,
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

    const { pair, action, lots, sl, tp } = req.body as {
      pair: string; action: string; lots: number; sl?: number | null; tp?: number | null;
    };

    if (!pair || !action || !lots) return void res.status(400).json({ error: "pair, action, lots required" });
    if (!INSTRUMENTS[pair]) return void res.status(400).json({ error: `Unknown pair: ${pair}` });
    if (!["BUY", "SELL"].includes(action)) return void res.status(400).json({ error: "action must be BUY or SELL" });
    if (lots < 0.01 || lots > 100) return void res.status(400).json({ error: "lots must be 0.01–100" });
    if (trader.balance <= 0) return void res.status(400).json({ error: "Insufficient balance. Please make a deposit." });

    const snap  = getPriceSnapshot();
    const pd    = snap[pair];
    const price = action === "BUY" ? pd.ask : pd.bid;

    await db.insert(forexPositions).values({
      sessionId: sid, pair, action, lots, openPrice: price, currentPrice: price, pnl: 0,
      sl: sl ?? null, tp: tp ?? null,
    });

    return void res.status(201).json({ ok: true, price, pair, action, lots });
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
    const id  = parseInt(req.params.id, 10);

    const [pos] = await db.select().from(forexPositions)
      .where(and(eq(forexPositions.id, id), eq(forexPositions.sessionId, sid)));
    if (!pos) return void res.status(404).json({ error: "Position not found" });

    const snap = getPriceSnapshot();
    const pd   = snap[pos.pair];
    const cur  = pd ? (pos.action === "BUY" ? pd.bid : pd.ask) : pos.currentPrice;
    const pnl  = calcPnl(pos.pair, pos.action, pos.lots, pos.openPrice, cur);
    const newBalance = parseFloat((trader.balance + pnl).toFixed(2));

    await db.delete(forexPositions).where(eq(forexPositions.id, id));
    await db.insert(forexClosedTrades).values({
      sessionId: sid, pair: pos.pair, action: pos.action, lots: pos.lots,
      openPrice: pos.openPrice, closePrice: cur, pnl,
      openedAt: pos.openedAt?.toISOString() ?? new Date().toISOString(),
    });
    await db.update(liveTraders).set({ balance: newBalance }).where(eq(liveTraders.id, trader.id));

    return void res.json({ ok: true, pnl: parseFloat(pnl.toFixed(2)), newBalance });
  } catch (err) {
    req.log.error({ err }, "live/positions delete error");
    return void res.status(500).json({ error: "Failed" });
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

// ── POST /api/live/deposit ────────────────────────────────────────────────────
router.post("/live/deposit", requireLive, async (req, res) => {
  try {
    const trader = (req as any).liveTrader as { id: number; email: string; fullName: string };
    const { amount, paymentMethod, paymentReference, contact } = req.body as Record<string, string>;

    if (!paymentMethod?.trim() || !paymentReference?.trim()) {
      return void res.status(400).json({ error: "Payment method and reference are required." });
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0 || amt > 10_000_000) {
      return void res.status(400).json({ error: "Enter a valid amount (1 – 10,000,000)." });
    }

    await db.insert(depositRequests).values({
      sessionId: liveSessionId(trader.id),
      traderName: trader.fullName,
      contact: contact?.trim() || trader.email,
      amount: amt,
      paymentMethod: paymentMethod.trim(),
      paymentReference: paymentReference.trim(),
      status: "pending",
    });

    return void res.status(201).json({
      ok: true,
      message: "Deposit request submitted. You will be credited once the admin confirms payment.",
    });
  } catch (err) {
    req.log.error({ err }, "live/deposit error");
    return void res.status(500).json({ error: "Failed" });
  }
});

export default router;
