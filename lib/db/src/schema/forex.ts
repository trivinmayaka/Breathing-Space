import { pgTable, serial, text, real, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const forexAccounts = pgTable("forex_accounts", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  balance: real("balance").notNull().default(10000),
  createdAt: timestamp("created_at").defaultNow(),
});

export const forexPositions = pgTable("forex_positions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  pair: text("pair").notNull(),
  action: text("action").notNull(),
  lots: real("lots").notNull(),
  openPrice: real("open_price").notNull(),
  currentPrice: real("current_price").notNull(),
  pnl: real("pnl").notNull().default(0),
  sl: real("sl"),
  tp: real("tp"),
  openedAt: timestamp("opened_at").defaultNow(),
});

export const forexClosedTrades = pgTable("forex_closed_trades", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  pair: text("pair").notNull(),
  action: text("action").notNull(),
  lots: real("lots").notNull(),
  openPrice: real("open_price").notNull(),
  closePrice: real("close_price").notNull(),
  pnl: real("pnl").notNull(),
  openedAt: text("opened_at").notNull(),
  closedAt: timestamp("closed_at").defaultNow(),
});

export const depositRequests = pgTable("deposit_requests", {
  id:               serial("id").primaryKey(),
  sessionId:        text("session_id").notNull(),
  traderName:       text("trader_name").notNull(),
  contact:          text("contact").notNull(),
  amount:           real("amount").notNull(),
  paymentMethod:    text("payment_method").notNull(),
  paymentReference: text("payment_reference").notNull(),
  status:           text("status").notNull().default("pending"), // pending | approved | rejected
  createdAt:        timestamp("created_at").defaultNow(),
  reviewedAt:       timestamp("reviewed_at"),
});

export const liveTraders = pgTable("live_traders", {
  id:           serial("id").primaryKey(),
  email:        text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName:     text("full_name").notNull(),
  balance:      real("balance").notNull().default(0),
  suspended:    boolean("suspended").notNull().default(false),
  createdAt:    timestamp("created_at").defaultNow(),
});

export const withdrawalRequests = pgTable("withdrawal_requests", {
  id:             serial("id").primaryKey(),
  sessionId:      text("session_id").notNull(),
  traderName:     text("trader_name").notNull(),
  amount:         real("amount").notNull(),
  paymentMethod:  text("payment_method").notNull(),   // e.g. M-Pesa, Bank Transfer
  accountDetails: text("account_details").notNull(),  // phone/account number to send to
  status:         text("status").notNull().default("pending"), // pending | approved | rejected
  note:           text("note"),                        // admin note on review
  createdAt:      timestamp("created_at").defaultNow(),
  reviewedAt:     timestamp("reviewed_at"),
});

// ── Company wallet ─────────────────────────────────────────────────────────────
// Tracks all fund movements in/out of the house (company) balance.
// type: "credit" = funds received by company (e.g. deduction from trader)
//       "debit"  = funds sent from company (e.g. payout, write-off)
export const companyWalletTransactions = pgTable("company_wallet_transactions", {
  id:                serial("id").primaryKey(),
  type:              text("type").notNull(),              // "credit" | "debit"
  amount:            real("amount").notNull(),            // always positive
  note:              text("note"),
  fromTraderId:      integer("from_trader_id"),           // trader funds were taken from
  fromTraderName:    text("from_trader_name"),
  toTraderId:        integer("to_trader_id"),             // trader funds were sent to (transfer)
  toTraderName:      text("to_trader_name"),
  createdAt:         timestamp("created_at").defaultNow(),
});

export type CompanyWalletTransaction = typeof companyWalletTransactions.$inferSelect;

export const insertForexPositionSchema = createInsertSchema(forexPositions).omit({ id: true, openedAt: true });
export type InsertForexPosition = z.infer<typeof insertForexPositionSchema>;
export type ForexPosition     = typeof forexPositions.$inferSelect;
export type ForexAccount      = typeof forexAccounts.$inferSelect;
export type ForexClosedTrade  = typeof forexClosedTrades.$inferSelect;
export type DepositRequest    = typeof depositRequests.$inferSelect;
export type LiveTrader        = typeof liveTraders.$inferSelect;
