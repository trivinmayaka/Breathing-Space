import { Router } from "express";
import { randomUUID, scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { eq, count, sum, gt, desc } from "drizzle-orm";
import {
  db, forexAccounts, forexPositions, forexClosedTrades,
  liveTraders, depositRequests, withdrawalRequests, companyWalletTransactions,
} from "@workspace/db";
import { adminSessions } from "../lib/admin-sessions";
import { getPriceSnapshot, calcPnl } from "../lib/forex-sim";
import type { Request, Response, NextFunction } from "express";

const router = Router();

const scryptAsync = promisify(scrypt);
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf  = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${buf.toString("hex")}`;
}

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
    maxAge: 8 * 60 * 60 * 1000,
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
    const [acctRow]     = await db.select({ c: count() }).from(forexAccounts);
    const [posRow]      = await db.select({ c: count() }).from(forexPositions);
    const [tradeRow]    = await db.select({ c: count(), totalPnl: sum(forexClosedTrades.pnl) }).from(forexClosedTrades);
    const [winRow]      = await db.select({ c: count() }).from(forexClosedTrades).where(gt(forexClosedTrades.pnl, 0));
    const [liveRow]     = await db.select({ c: count() }).from(liveTraders);
    const [suspRow]     = await db.select({ c: count() }).from(liveTraders).where(eq(liveTraders.suspended, true));
    const [pendDepRow]  = await db.select({ c: count() }).from(depositRequests).where(eq(depositRequests.status, "pending"));
    const [pendWdRow]   = await db.select({ c: count() }).from(withdrawalRequests).where(eq(withdrawalRequests.status, "pending"));
    const [balRow]      = await db.select({ total: sum(liveTraders.balance) }).from(liveTraders);

    const totalTrades = Number(tradeRow?.c ?? 0);
    const wins        = Number(winRow?.c ?? 0);

    res.json({
      totalAccounts:      Number(acctRow?.c ?? 0),
      openPositions:      Number(posRow?.c ?? 0),
      totalTrades,
      totalPnl:           parseFloat(Number(tradeRow?.totalPnl ?? 0).toFixed(2)),
      winRate:            totalTrades > 0 ? parseFloat((wins / totalTrades * 100).toFixed(1)) : 0,
      liveTraderCount:    Number(liveRow?.c ?? 0),
      suspendedCount:     Number(suspRow?.c ?? 0),
      pendingDeposits:    Number(pendDepRow?.c ?? 0),
      pendingWithdrawals: Number(pendWdRow?.c ?? 0),
      totalLiveBalance:   parseFloat(Number(balRow?.total ?? 0).toFixed(2)),
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
          .where(eq(forexClosedTrades.sessionId, sid))
          .where(gt(forexClosedTrades.pnl, 0));

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
        id:              t.id,
        email:           t.email,
        fullName:        t.fullName,
        balance:         t.balance,
        suspended:       t.suspended,
        createdAt:       t.createdAt,
        openPositions:   Number(posRow?.c ?? 0),
        totalTrades,
        netPnl:          parseFloat(Number(tradeRow?.pnl ?? 0).toFixed(2)),
        winRate:         totalTrades > 0 ? parseFloat((wins / totalTrades * 100).toFixed(1)) : 0,
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

// ── PATCH /api/admin/live-traders/:id/suspend ─────────────────────────────────
router.patch("/admin/live-traders/:id/suspend", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { suspended } = req.body as { suspended?: boolean };
    if (typeof suspended !== "boolean") {
      return void res.status(400).json({ error: "suspended must be a boolean" });
    }
    const [trader] = await db.select().from(liveTraders).where(eq(liveTraders.id, id));
    if (!trader) return void res.status(404).json({ error: "Trader not found" });
    await db.update(liveTraders).set({ suspended }).where(eq(liveTraders.id, id));
    res.json({ ok: true, suspended });
  } catch (err) {
    req.log.error({ err }, "admin/live-traders suspend error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/admin/live-traders/:id/close-all ────────────────────────────────
router.post("/admin/live-traders/:id/close-all", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sid = `live-${id}`;
    const prices = getPriceSnapshot();

    const positions = await db.select().from(forexPositions).where(eq(forexPositions.sessionId, sid));
    if (positions.length === 0) return void res.json({ ok: true, closed: 0, pnl: 0 });

    let totalPnl = 0;
    for (const pos of positions) {
      const cp  = prices[pos.pair] ?? pos.openPrice;
      const pnl = calcPnl(pos.action, pos.lots, pos.openPrice, cp);
      totalPnl += pnl;
      await db.insert(forexClosedTrades).values({
        sessionId:  sid,
        pair:       pos.pair,
        action:     pos.action,
        lots:       pos.lots,
        openPrice:  pos.openPrice,
        closePrice: cp,
        pnl:        parseFloat(pnl.toFixed(2)),
        openedAt:   pos.openedAt?.toISOString() ?? new Date().toISOString(),
      });
    }

    await db.delete(forexPositions).where(eq(forexPositions.sessionId, sid));

    const [trader] = await db.select().from(liveTraders).where(eq(liveTraders.id, id));
    if (trader) {
      const newBalance = parseFloat((trader.balance + totalPnl).toFixed(2));
      await db.update(liveTraders).set({ balance: Math.max(0, newBalance) }).where(eq(liveTraders.id, id));
    }

    res.json({ ok: true, closed: positions.length, pnl: parseFloat(totalPnl.toFixed(2)) });
  } catch (err) {
    req.log.error({ err }, "admin/live-traders close-all error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── GET /api/admin/live-traders/:id/trades ────────────────────────────────────
router.get("/admin/live-traders/:id/trades", requireAdmin, async (req, res) => {
  try {
    const id  = parseInt(req.params.id, 10);
    const sid = `live-${id}`;
    const trades = await db
      .select()
      .from(forexClosedTrades)
      .where(eq(forexClosedTrades.sessionId, sid))
      .orderBy(desc(forexClosedTrades.closedAt));
    res.json(trades);
  } catch (err) {
    req.log.error({ err }, "admin/live-traders trades error");
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

// ── POST /api/admin/live-traders ─────────────────────────────────────────────
router.post("/admin/live-traders", requireAdmin, async (req, res) => {
  try {
    const { email, fullName, password, balance } = req.body as {
      email?: string; fullName?: string; password?: string; balance?: number;
    };
    if (!email?.trim() || !fullName?.trim() || !password) {
      return void res.status(400).json({ error: "Email, full name, and password are required." });
    }
    if (password.length < 6) {
      return void res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    const emailLower = email.trim().toLowerCase();
    const [existing] = await db.select().from(liveTraders).where(eq(liveTraders.email, emailLower));
    if (existing) {
      return void res.status(409).json({ error: "An account with this email already exists." });
    }
    const passwordHash = await hashPassword(password);
    const startBalance = typeof balance === "number" && balance >= 0 ? balance : 0;
    const [trader] = await db.insert(liveTraders).values({
      email: emailLower, passwordHash, fullName: fullName.trim(), balance: startBalance,
    }).returning();
    res.status(201).json({
      id: trader.id, email: trader.email, fullName: trader.fullName,
      balance: trader.balance, suspended: trader.suspended,
      createdAt: trader.createdAt?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "admin/create-trader error");
    res.status(500).json({ error: "Failed to create trader" });
  }
});

// ── POST /api/admin/live-traders/:id/reset-password ───────────────────────────
router.post("/admin/live-traders/:id/reset-password", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { password } = req.body as { password?: string };
    if (!password || password.length < 6) {
      return void res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    const [trader] = await db.select().from(liveTraders).where(eq(liveTraders.id, id));
    if (!trader) return void res.status(404).json({ error: "Trader not found" });
    const passwordHash = await hashPassword(password);
    await db.update(liveTraders).set({ passwordHash }).where(eq(liveTraders.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "admin/reset-password error");
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// ── POST /api/admin/deposits/:id/reverse ─────────────────────────────────────
router.post("/admin/deposits/:id/reverse", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });

    const [dep] = await db.select().from(depositRequests).where(eq(depositRequests.id, id));
    if (!dep) return void res.status(404).json({ error: "Deposit not found" });
    if (dep.status !== "approved") return void res.status(409).json({ error: "Can only reverse approved deposits" });

    // Deduct from trader balance (floor at 0)
    if (dep.sessionId.startsWith("live-")) {
      const traderId = parseInt(dep.sessionId.slice(5), 10);
      if (!isNaN(traderId)) {
        const [trader] = await db.select().from(liveTraders).where(eq(liveTraders.id, traderId));
        if (trader) {
          const newBal = parseFloat(Math.max(0, trader.balance - dep.amount).toFixed(2));
          await db.update(liveTraders).set({ balance: newBal }).where(eq(liveTraders.id, traderId));
        }
      }
    }

    await db.update(depositRequests)
      .set({ status: "reversed", reviewedAt: new Date() })
      .where(eq(depositRequests.id, id));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "admin/deposits/reverse error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/admin/live-traders/:id/manual-deposit ───────────────────────────
// destination: "none" | "company" | "trader"
// destinationTraderId: required when destination === "trader"
router.post("/admin/live-traders/:id/manual-deposit", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });

    const { amount, note, destination, destinationTraderId } = req.body as {
      amount?: number;
      note?: string;
      destination?: "none" | "company" | "trader";
      destinationTraderId?: number;
    };
    const amt = typeof amount === "number" ? amount : parseFloat(String(amount));
    if (isNaN(amt) || amt === 0 || Math.abs(amt) > 10_000_000) {
      return void res.status(400).json({ error: "Enter a valid amount (non-zero, max ±10,000,000)" });
    }

    const [trader] = await db.select().from(liveTraders).where(eq(liveTraders.id, id));
    if (!trader) return void res.status(404).json({ error: "Trader not found" });

    const newBalance = parseFloat(Math.max(0, trader.balance + amt).toFixed(2));
    await db.update(liveTraders).set({ balance: newBalance }).where(eq(liveTraders.id, id));

    // Record as an approved deposit (positive) or reversed (negative adjustment)
    const dest = amt < 0 ? (destination ?? "none") : "none";
    const noteText = note?.trim() || "Manual adjustment by admin";

    await db.insert(depositRequests).values({
      sessionId: `live-${id}`,
      traderName: trader.fullName,
      contact: trader.email,
      amount: Math.abs(amt),
      paymentMethod: amt > 0 ? "Admin Manual Credit" : "Admin Deduction",
      paymentReference: noteText,
      status: amt > 0 ? "approved" : "reversed",
      reviewedAt: new Date(),
    });

    // ── Handle deduction destinations ─────────────────────────────────────────
    if (amt < 0) {
      const deductedAmt = Math.abs(amt);

      if (dest === "company") {
        // Credit company wallet
        await db.insert(companyWalletTransactions).values({
          type: "credit",
          amount: deductedAmt,
          note: noteText,
          fromTraderId: trader.id,
          fromTraderName: trader.fullName,
        });
      } else if (dest === "trader" && destinationTraderId) {
        const destId = typeof destinationTraderId === "number"
          ? destinationTraderId
          : parseInt(String(destinationTraderId), 10);
        const [destTrader] = await db.select().from(liveTraders).where(eq(liveTraders.id, destId));
        if (!destTrader) return void res.status(404).json({ error: "Destination trader not found" });

        // Credit destination trader
        const destNewBalance = parseFloat((destTrader.balance + deductedAmt).toFixed(2));
        await db.update(liveTraders).set({ balance: destNewBalance }).where(eq(liveTraders.id, destId));

        // Record the credit in deposit history for destination trader
        await db.insert(depositRequests).values({
          sessionId: `live-${destId}`,
          traderName: destTrader.fullName,
          contact: destTrader.email,
          amount: deductedAmt,
          paymentMethod: "Admin Transfer",
          paymentReference: `Transfer from ${trader.fullName}${noteText !== "Manual adjustment by admin" ? ` — ${noteText}` : ""}`,
          status: "approved",
          reviewedAt: new Date(),
        });

        // Log in company wallet as a pass-through transfer
        await db.insert(companyWalletTransactions).values({
          type: "credit",
          amount: deductedAmt,
          note: `Transfer: ${trader.fullName} → ${destTrader.fullName}${noteText !== "Manual adjustment by admin" ? ` — ${noteText}` : ""}`,
          fromTraderId: trader.id,
          fromTraderName: trader.fullName,
          toTraderId: destTrader.id,
          toTraderName: destTrader.fullName,
        });
        await db.insert(companyWalletTransactions).values({
          type: "debit",
          amount: deductedAmt,
          note: `Transfer: ${trader.fullName} → ${destTrader.fullName}${noteText !== "Manual adjustment by admin" ? ` — ${noteText}` : ""}`,
          fromTraderId: trader.id,
          fromTraderName: trader.fullName,
          toTraderId: destTrader.id,
          toTraderName: destTrader.fullName,
        });

        return void res.json({ ok: true, newBalance, destNewBalance, destTraderName: destTrader.fullName });
      }
    }

    res.json({ ok: true, newBalance });
  } catch (err) {
    req.log.error({ err }, "admin/manual-deposit error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── GET /api/admin/company-wallet ─────────────────────────────────────────────
router.get("/admin/company-wallet", requireAdmin, async (req, res) => {
  try {
    // Calculate true balance across ALL transactions (no limit)
    const allTxns = await db
      .select({ type: companyWalletTransactions.type, amount: companyWalletTransactions.amount })
      .from(companyWalletTransactions);
    const balance = allTxns.reduce((acc, t) => t.type === "credit" ? acc + t.amount : acc - t.amount, 0);

    // Fetch recent 500 for display
    const txns = await db
      .select()
      .from(companyWalletTransactions)
      .orderBy(desc(companyWalletTransactions.createdAt))
      .limit(500);

    res.json({ balance: parseFloat(balance.toFixed(2)), transactions: txns });
  } catch (err) {
    req.log.error({ err }, "admin/company-wallet error");
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

    const traderId = parseInt(wr.sessionId.replace("live-", ""), 10);
    const [trader] = await db.select().from(liveTraders).where(eq(liveTraders.id, traderId));
    if (!trader) return void res.status(404).json({ error: "Trader not found" });

    if (wr.amount > trader.balance) {
      return void res.status(400).json({
        error: `Trader balance ($${trader.balance.toFixed(2)}) is less than withdrawal amount ($${wr.amount.toFixed(2)}).`,
      });
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
