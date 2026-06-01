import { pgTable, serial, text, boolean, numeric, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const strategiesTable = pgTable("strategies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  symbol: text("symbol").notNull(),
  interval: text("interval").notNull(),
  params: jsonb("params").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStrategySchema = createInsertSchema(strategiesTable).omit({ id: true, createdAt: true });
export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type Strategy = typeof strategiesTable.$inferSelect;

export const backtestResultsTable = pgTable("backtest_results", {
  id: serial("id").primaryKey(),
  strategyId: integer("strategy_id").notNull(),
  strategyName: text("strategy_name").notNull(),
  symbol: text("symbol").notNull(),
  interval: text("interval").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  initialCapital: numeric("initial_capital", { precision: 20, scale: 8 }).notNull(),
  finalCapital: numeric("final_capital", { precision: 20, scale: 8 }).notNull(),
  totalReturn: numeric("total_return", { precision: 10, scale: 4 }).notNull(),
  annualizedReturn: numeric("annualized_return", { precision: 10, scale: 4 }).notNull(),
  maxDrawdown: numeric("max_drawdown", { precision: 10, scale: 4 }).notNull(),
  winRate: numeric("win_rate", { precision: 10, scale: 4 }).notNull(),
  profitFactor: numeric("profit_factor", { precision: 10, scale: 4 }).notNull(),
  totalTrades: integer("total_trades").notNull(),
  status: text("status").notNull().default("completed"),
  equityCurve: jsonb("equity_curve"),
  trades: jsonb("trades"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type BacktestResult = typeof backtestResultsTable.$inferSelect;

export const positionsTable = pgTable("positions", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  size: numeric("size", { precision: 20, scale: 8 }).notNull(),
  entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
  currentPrice: numeric("current_price", { precision: 20, scale: 8 }).notNull(),
  unrealizedPnl: numeric("unrealized_pnl", { precision: 20, scale: 8 }).notNull(),
  unrealizedPnlPct: numeric("unrealized_pnl_pct", { precision: 10, scale: 4 }).notNull(),
  strategyName: text("strategy_name").notNull(),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
});

export type Position = typeof positionsTable.$inferSelect;

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  type: text("type").notNull(),
  size: numeric("size", { precision: 20, scale: 8 }).notNull(),
  price: numeric("price", { precision: 20, scale: 8 }).notNull(),
  status: text("status").notNull(),
  strategyName: text("strategy_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Order = typeof ordersTable.$inferSelect;

export const riskSettingsTable = pgTable("risk_settings", {
  id: serial("id").primaryKey(),
  maxPositionSizePct: numeric("max_position_size_pct", { precision: 10, scale: 4 }).notNull().default("5"),
  maxDailyLossPct: numeric("max_daily_loss_pct", { precision: 10, scale: 4 }).notNull().default("3"),
  maxLeverage: numeric("max_leverage", { precision: 10, scale: 2 }).notNull().default("1"),
  maxOpenPositions: integer("max_open_positions").notNull().default(5),
  stopLossPct: numeric("stop_loss_pct", { precision: 10, scale: 4 }).notNull().default("2"),
  takeProfitPct: numeric("take_profit_pct", { precision: 10, scale: 4 }).notNull().default("6"),
  trailingStopPct: numeric("trailing_stop_pct", { precision: 10, scale: 4 }).notNull().default("1.5"),
  trailingStopEnabled: boolean("trailing_stop_enabled").notNull().default(false),
  emergencyStopEnabled: boolean("emergency_stop_enabled").notNull().default(false),
  maxSingleOrderUsdt: numeric("max_single_order_usdt", { precision: 20, scale: 2 }).notNull().default("500"),
  maxTotalExposureUsdt: numeric("max_total_exposure_usdt", { precision: 20, scale: 2 }).notNull().default("2000"),
  maxConsecutiveLosses: integer("max_consecutive_losses").notNull().default(5),
  allowedSymbols: jsonb("allowed_symbols").notNull().default(["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type RiskSettings = typeof riskSettingsTable.$inferSelect;

export const tradeRecordsTable = pgTable("trade_records", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  size: numeric("size", { precision: 20, scale: 8 }).notNull(),
  price: numeric("price", { precision: 20, scale: 8 }).notNull(),
  fee: numeric("fee", { precision: 20, scale: 8 }).notNull(),
  pnl: numeric("pnl", { precision: 20, scale: 8 }).notNull(),
  pnlPct: numeric("pnl_pct", { precision: 10, scale: 4 }).notNull(),
  strategyName: text("strategy_name").notNull(),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
  mode: text("mode").notNull().default("paper"),
  orderSource: text("order_source").notNull().default("strategy"),
  exchangeOrderId: text("exchange_order_id"),
});

export type TradeRecord = typeof tradeRecordsTable.$inferSelect;

export const systemSettingsTable = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  mode: text("mode").notNull().default("paper"),
  exchangeName: text("exchange_name").notNull().default("Binance"),
  networkMode: text("network_mode").notNull().default("testnet"),
  apiKeySet: boolean("api_key_set").notNull().default(false),
  tradingEnabled: boolean("trading_enabled").notNull().default(false),
  liveReadyStep: integer("live_ready_step").notNull().default(0),
  connectionStatus: text("connection_status").notNull().default("disconnected"),
  connectionError: text("connection_error"),
  lastConnectedAt: timestamp("last_connected_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SystemSettings = typeof systemSettingsTable.$inferSelect;

export const exchangeConnectionsTable = pgTable("exchange_connections", {
  id: serial("id").primaryKey(),
  exchange: text("exchange").notNull().default("Binance"),
  apiKeyEncrypted: text("api_key_encrypted"),
  apiSecretEncrypted: text("api_secret_encrypted"),
  networkMode: text("network_mode").notNull().default("testnet"),
  isConnected: boolean("is_connected").notNull().default(false),
  lastTestedAt: timestamp("last_tested_at"),
  connectionError: text("connection_error"),
  accountInfo: jsonb("account_info"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ExchangeConnection = typeof exchangeConnectionsTable.$inferSelect;

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  details: jsonb("details"),
  mode: text("mode").notNull().default("paper"),
  source: text("source").notNull().default("manual"),
  result: text("result").notNull().default("success"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;

export const dailyPnlTable = pgTable("daily_pnl", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  realizedPnl: numeric("realized_pnl", { precision: 20, scale: 8 }).notNull().default("0"),
  tradeCount: integer("trade_count").notNull().default(0),
  consecutiveLosses: integer("consecutive_losses").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DailyPnl = typeof dailyPnlTable.$inferSelect;
