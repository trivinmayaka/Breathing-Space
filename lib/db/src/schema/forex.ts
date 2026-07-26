import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
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

export const insertForexPositionSchema = createInsertSchema(forexPositions).omit({ id: true, openedAt: true });
export type InsertForexPosition = z.infer<typeof insertForexPositionSchema>;
export type ForexPosition     = typeof forexPositions.$inferSelect;
export type ForexAccount      = typeof forexAccounts.$inferSelect;
export type ForexClosedTrade  = typeof forexClosedTrades.$inferSelect;
export type DepositRequest    = typeof depositRequests.$inferSelect;
