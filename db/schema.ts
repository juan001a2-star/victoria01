import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  bigint,
  decimal,
} from "drizzle-orm/pg-core";

// ── AUTH USERS (from Kimi OAuth) ──────────────────────────────────────
export const authUsers = pgTable("auth_users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: varchar("role", { length: 20 }).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

// ── LOTTERY USERS (banca system) ──────────────────────────────────────
export const lotteryUsers = pgTable("lottery_users", {
  id: serial("id").primaryKey(),
  bankNumber: varchar("bank_number", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  role: varchar("lottery_role", { length: 20 }).default("user").notNull(),
  groupId: bigint("group_id", { mode: "number" }).references(() => groups.id),
  credit: decimal("credit", { precision: 12, scale: 2 }).default("500.00").notNull(),
  commission: decimal("commission", { precision: 5, scale: 2 }).default("10.00").notNull(),
  active: boolean("active").default(true).notNull(),
  language: varchar("language", { length: 5 }).default("es").notNull(),
  fingerprintToken: varchar("fingerprint_token", { length: 128 }),
  boundDeviceId: varchar("bound_device_id", { length: 128 }),
  boundDeviceLabel: varchar("bound_device_label", { length: 120 }),
  boundAt: timestamp("bound_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── GROUPS ────────────────────────────────────────────────────────────
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  maxSalesPerDay: decimal("max_sales_per_day", { precision: 12, scale: 2 }).default("50000.00"),
  playLimitDirecto: integer("play_limit_directo").default(1000),
  playLimitPale: integer("play_limit_pale").default(500),
  playLimitTripleta: integer("play_limit_tripleta").default(300),
  playLimitCuatrena: integer("play_limit_cuatrena").default(200),
  playLimitTerna: integer("play_limit_terna").default(200),
  enableDirecto: boolean("enable_directo").default(true),
  enablePale: boolean("enable_pale").default(true),
  enableTripleta: boolean("enable_tripleta").default(true),
  enableCuatrena: boolean("enable_cuatrena").default(true),
  enableTerna: boolean("enable_terna").default(true),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── LOTTERIES ─────────────────────────────────────────────────────────
export const lotteries = pgTable("lotteries", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  drawTime: varchar("draw_time", { length: 10 }).default("12:00").notNull(),
  openTime: varchar("open_time", { length: 10 }).default("06:00").notNull(),
  closeTime: varchar("close_time", { length: 10 }).default("11:00").notNull(),
  schedule: text("schedule"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── TICKETS ───────────────────────────────────────────────────────────
export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => lotteryUsers.id),
  lotteryId: bigint("lottery_id", { mode: "number" }).notNull().references(() => lotteries.id),
  total: decimal("total", { precision: 10, scale: 2 }).default("0.00").notNull(),
  commission: decimal("commission", { precision: 5, scale: 2 }).default("10.00").notNull(),
  netDeduction: decimal("net_deduction", { precision: 10, scale: 2 }).default("0.00").notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  annulledBy: bigint("annulled_by", { mode: "number" }).references(() => lotteryUsers.id),
  annulledAt: timestamp("annulled_at"),
  winnerId: bigint("winner_id", { mode: "number" }).references(() => winners.id),
  prizeAmount: decimal("prize_amount", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── PLAYS (individual plays within a ticket) ──────────────────────────
export const plays = pgTable("plays", {
  id: serial("id").primaryKey(),
  ticketId: bigint("ticket_id", { mode: "number" }).notNull().references(() => tickets.id),
  number: varchar("number", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  type: varchar("play_type", { length: 20 }).default("directo").notNull(),
  lotteryId: bigint("lottery_id", { mode: "number" }).notNull().references(() => lotteries.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── WINNERS (draw results) ────────────────────────────────────────────
export const winners = pgTable("winners", {
  id: serial("id").primaryKey(),
  lotteryId: bigint("lottery_id", { mode: "number" }).notNull().references(() => lotteries.id),
  firstPrize: varchar("first_prize", { length: 10 }).notNull(),
  secondPrize: varchar("second_prize", { length: 10 }).notNull(),
  thirdPrize: varchar("third_prize", { length: 10 }).notNull(),
  drawDate: varchar("draw_date", { length: 15 }).notNull(),
  createdBy: bigint("created_by", { mode: "number" }).references(() => lotteryUsers.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedBy: bigint("updated_by", { mode: "number" }).references(() => lotteryUsers.id),
  updatedAt: timestamp("updated_at"),
});

// ── PRIZES (payout multipliers per play type) ──────────────────────────
export const prizes = pgTable("prizes", {
  id: serial("id").primaryKey(),
  playType: varchar("play_type", { length: 20 }).notNull(),
  firstPrizeMultiplier: decimal("first_prize_multiplier", { precision: 10, scale: 2 }).default("50.00"),
  secondPrizeMultiplier: decimal("second_prize_multiplier", { precision: 10, scale: 2 }).default("15.00"),
  thirdPrizeMultiplier: decimal("third_prize_multiplier", { precision: 10, scale: 2 }).default("10.00"),
  paleFirstSecondMultiplier: decimal("pale_first_second", { precision: 10, scale: 2 }).default("25.00"),
  paleFirstThirdMultiplier: decimal("pale_first_third", { precision: 10, scale: 2 }).default("0.00"),
  paleSecondThirdMultiplier: decimal("pale_second_third", { precision: 10, scale: 2 }).default("0.00"),
  fixedMultiplier: decimal("fixed_multiplier", { precision: 12, scale: 2 }).default("0.00"),
  description: varchar("description", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

// ── PLAY LIMITS (pale/tripleta max amounts per combination) ───────────
export const playLimits = pgTable("play_limits", {
  id: serial("id").primaryKey(),
  lotteryId: bigint("lottery_id", { mode: "number" }).notNull().references(() => lotteries.id),
  playType: varchar("play_type", { length: 20 }).notNull(),
  numberCombo: varchar("number_combo", { length: 50 }).notNull(),
  maxAmount: decimal("max_amount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── CREDIT ADJUSTMENTS (historial de credito agregado/descontado - contabilidad) ──
export const creditAdjustments = pgTable("credit_adjustments", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => lotteryUsers.id),
  adjustedBy: bigint("adjusted_by", { mode: "number" }).notNull().references(() => lotteryUsers.id),
  type: varchar("type", { length: 20 }).notNull(), // "deposit" (venta entregada) | "payout" (premio pagado) | "correction"
  direction: varchar("direction", { length: 10 }).default("add").notNull(), // "add" | "subtract" - el signo real aplicado al balance
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(), // siempre positivo; el signo real lo da "direction"
  balanceAfter: decimal("balance_after", { precision: 12, scale: 2 }).notNull(),
  note: varchar("note", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── CONFIG (global settings) ──────────────────────────────────────────
export const config = pgTable("config", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

// ── Types ─────────────────────────────────────────────────────────────
export type AuthUser = typeof authUsers.$inferSelect;
export type LotteryUser = typeof lotteryUsers.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Lottery = typeof lotteries.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type Play = typeof plays.$inferSelect;
export type Winner = typeof winners.$inferSelect;
export type Config = typeof config.$inferSelect;
export type Prize = typeof prizes.$inferSelect;
export type PlayLimit = typeof playLimits.$inferSelect;
export type CreditAdjustment = typeof creditAdjustments.$inferSelect;
