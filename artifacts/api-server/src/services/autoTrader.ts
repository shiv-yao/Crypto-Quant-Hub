import { and, eq } from "drizzle-orm";
import {
  db,
  strategiesTable,
  positionsTable,
  ordersTable,
  tradeRecordsTable,
  riskSettingsTable,
  dailyPnlTable,
  auditLogsTable,
} from "@workspace/db";
import { createOkxService } from "./okx.js";

interface EngineState {
  enabled: boolean;
  running: boolean;
  startedAt: string | null;
  lastCycleAt: string | null;
  lastError: string | null;
  cycleCount: number;
  signalCount: number;
  openedPositions: number;
  closedPositions: number;
  demoBrokerOrders: number;
  logs: Array<{ time: string; level: "info" | "warn" | "error"; message: string }>;
}

const DEFAULT_STRATEGIES = [
  { name: "OKX BTC 趨勢策略", type: "sma_cross", symbol: "BTC/USDT", interval: "5m", params: { fast: 5, slow: 12, orderUsdt: 20 } },
  { name: "OKX ETH 趨勢策略", type: "sma_cross", symbol: "ETH/USDT", interval: "5m", params: { fast: 5, slow: 12, orderUsdt: 20 } },
  { name: "OKX SOL 趨勢策略", type: "sma_cross", symbol: "SOL/USDT", interval: "5m", params: { fast: 5, slow: 12, orderUsdt: 20 } },
];

const state: EngineState = {
  enabled: process.env.AUTO_TRADING_ENABLED !== "false",
  running: false,
  startedAt: null,
  lastCycleAt: null,
  lastError: null,
  cycleCount: 0,
  signalCount: 0,
  openedPositions: 0,
  closedPositions: 0,
  demoBrokerOrders: 0,
  logs: [],
};

let timer: NodeJS.Timeout | null = null;

function log(level: EngineState["logs"][number]["level"], message: string) {
  state.logs.unshift({ time: new Date().toISOString(), level, message });
  state.logs = state.logs.slice(0, 80);
  if (level === "error") console.error(`[auto-trader] ${message}`);
  else console.log(`[auto-trader] ${message}`);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function ensureRiskSettings() {
  const [existing] = await db.select().from(riskSettingsTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(riskSettingsTable).values({
    maxPositionSizePct: "2",
    maxDailyLossPct: "3",
    maxLeverage: "1",
    maxOpenPositions: 3,
    stopLossPct: "2",
    takeProfitPct: "5",
    trailingStopPct: "1.5",
    trailingStopEnabled: false,
    emergencyStopEnabled: false,
    maxSingleOrderUsdt: "50",
    maxTotalExposureUsdt: "120",
    maxConsecutiveLosses: 3,
    allowedSymbols: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
  }).returning();
  return created;
}

export async function ensureDefaultStrategies() {
  const existing = await db.select().from(strategiesTable);
  if (existing.length > 0) return existing;
  const created = await db.insert(strategiesTable).values(DEFAULT_STRATEGIES).returning();
  log("info", `已建立 ${created.length} 個 OKX 預設策略`);
  return created;
}

async function ensureDailyPnl() {
  const date = todayKey();
  const [existing] = await db.select().from(dailyPnlTable).where(eq(dailyPnlTable.date, date)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(dailyPnlTable).values({ date }).returning();
  return created;
}

function privateOkxDemoClient() {
  const apiKey = process.env.OKX_API_KEY ?? "";
  const apiSecret = process.env.OKX_API_SECRET ?? "";
  const passphrase = process.env.OKX_API_PASSPHRASE ?? "";
  if (!apiKey || !apiSecret || !passphrase) return null;
  return createOkxService(apiKey, apiSecret, passphrase, "testnet");
}

async function maybeSendOkxDemoOrder(symbol: string, side: "BUY" | "SELL", quoteOrBaseSize: number) {
  if (process.env.AUTO_OKX_DEMO_ORDERS !== "true") return null;
  if (process.env.OKX_NETWORK_MODE === "mainnet") {
    log("warn", "偵測到 OKX_NETWORK_MODE=mainnet，自動 Demo 下單已拒絕");
    return null;
  }
  const client = privateOkxDemoClient();
  if (!client) {
    log("warn", "AUTO_OKX_DEMO_ORDERS=true，但 OKX Demo API Variables 尚未設定完整");
    return null;
  }
  const order = await client.placeDemoOrder({ symbol, side, type: "MARKET", quantity: String(quoteOrBaseSize) });
  state.demoBrokerOrders += 1;
  return order.ordId;
}

async function openPosition(strategy: typeof strategiesTable.$inferSelect, price: number, orderUsdt: number) {
  const size = orderUsdt / price;
  const externalOrderId = await maybeSendOkxDemoOrder(strategy.symbol, "BUY", orderUsdt).catch((error) => {
    log("warn", `OKX Demo BUY 同步失敗：${error instanceof Error ? error.message : "未知錯誤"}`);
    return null;
  });

  await db.insert(ordersTable).values({
    symbol: strategy.symbol,
    side: "BUY",
    type: "MARKET",
    size: String(size),
    price: String(price),
    status: externalOrderId ? "DEMO_FILLED" : "PAPER_FILLED",
    strategyName: strategy.name,
  });

  await db.insert(positionsTable).values({
    symbol: strategy.symbol,
    side: "LONG",
    size: String(size),
    entryPrice: String(price),
    currentPrice: String(price),
    unrealizedPnl: "0",
    unrealizedPnlPct: "0",
    strategyName: strategy.name,
  });

  await db.insert(tradeRecordsTable).values({
    symbol: strategy.symbol,
    side: "BUY",
    size: String(size),
    price: String(price),
    fee: String(orderUsdt * 0.001),
    pnl: "0",
    pnlPct: "0",
    strategyName: strategy.name,
    mode: externalOrderId ? "okx_demo" : "paper",
    orderSource: "auto_strategy",
    exchangeOrderId: externalOrderId,
  });

  await db.insert(auditLogsTable).values({
    action: "auto_position_opened",
    details: { symbol: strategy.symbol, strategy: strategy.name, orderUsdt, price, size, externalOrderId },
    mode: externalOrderId ? "okx_demo" : "paper",
    source: "auto_strategy",
    result: "success",
  });

  state.openedPositions += 1;
  log("info", `建立模擬持倉 ${strategy.symbol} · ${orderUsdt.toFixed(2)} USDT`);
}

async function closePosition(position: typeof positionsTable.$inferSelect, price: number, reason: string) {
  const size = Number(position.size);
  const entry = Number(position.entryPrice);
  const pnl = (price - entry) * size;
  const pnlPct = entry > 0 ? ((price - entry) / entry) * 100 : 0;
  const externalOrderId = await maybeSendOkxDemoOrder(position.symbol, "SELL", size).catch((error) => {
    log("warn", `OKX Demo SELL 同步失敗：${error instanceof Error ? error.message : "未知錯誤"}`);
    return null;
  });

  await db.insert(ordersTable).values({
    symbol: position.symbol,
    side: "SELL",
    type: "MARKET",
    size: String(size),
    price: String(price),
    status: externalOrderId ? "DEMO_FILLED" : "PAPER_FILLED",
    strategyName: position.strategyName,
  });

  await db.insert(tradeRecordsTable).values({
    symbol: position.symbol,
    side: "SELL",
    size: String(size),
    price: String(price),
    fee: String(price * size * 0.001),
    pnl: String(pnl),
    pnlPct: String(pnlPct),
    strategyName: position.strategyName,
    mode: externalOrderId ? "okx_demo" : "paper",
    orderSource: "auto_strategy",
    exchangeOrderId: externalOrderId,
  });

  await db.delete(positionsTable).where(eq(positionsTable.id, position.id));

  const daily = await ensureDailyPnl();
  const nextLosses = pnl < 0 ? daily.consecutiveLosses + 1 : 0;
  await db.update(dailyPnlTable).set({
    realizedPnl: String(Number(daily.realizedPnl) + pnl),
    tradeCount: daily.tradeCount + 1,
    consecutiveLosses: nextLosses,
    updatedAt: new Date(),
  }).where(eq(dailyPnlTable.id, daily.id));

  await db.insert(auditLogsTable).values({
    action: "auto_position_closed",
    details: { symbol: position.symbol, strategy: position.strategyName, price, size, pnl, pnlPct, reason, externalOrderId },
    mode: externalOrderId ? "okx_demo" : "paper",
    source: "auto_strategy",
    result: "success",
  });

  state.closedPositions += 1;
  log("info", `平倉 ${position.symbol} · ${reason} · PnL ${pnl.toFixed(4)} USDT`);
}

async function updateAndMaybeClosePositions(risk: Awaited<ReturnType<typeof ensureRiskSettings>>) {
  const client = createOkxService();
  const positions = await db.select().from(positionsTable);
  for (const position of positions) {
    const [ticker] = await client.getTickers([position.symbol]);
    if (!ticker) continue;
    const price = Number(ticker.last);
    const entry = Number(position.entryPrice);
    const size = Number(position.size);
    const pnl = (price - entry) * size;
    const pnlPct = entry > 0 ? ((price - entry) / entry) * 100 : 0;
    await db.update(positionsTable).set({
      currentPrice: String(price),
      unrealizedPnl: String(pnl),
      unrealizedPnlPct: String(pnlPct),
    }).where(eq(positionsTable.id, position.id));

    if (pnlPct <= -Number(risk.stopLossPct)) await closePosition(position, price, "stop_loss");
    else if (pnlPct >= Number(risk.takeProfitPct)) await closePosition(position, price, "take_profit");
  }
}

async function evaluateEntries(risk: Awaited<ReturnType<typeof ensureRiskSettings>>) {
  const daily = await ensureDailyPnl();
  if (risk.emergencyStopEnabled) {
    log("warn", "emergency_stop_enabled=true，略過進場");
    return;
  }
  if (daily.consecutiveLosses >= risk.maxConsecutiveLosses) {
    log("warn", `連續虧損 ${daily.consecutiveLosses} 次，略過進場`);
    return;
  }

  const positions = await db.select().from(positionsTable);
  if (positions.length >= risk.maxOpenPositions) return;
  const exposure = positions.reduce((sum, position) => sum + Number(position.size) * Number(position.entryPrice), 0);
  if (exposure >= Number(risk.maxTotalExposureUsdt)) return;

  const activeStrategies = await db.select().from(strategiesTable).where(eq(strategiesTable.isActive, true));
  const client = createOkxService();

  for (const strategy of activeStrategies) {
    const existing = await db.select().from(positionsTable).where(and(eq(positionsTable.symbol, strategy.symbol), eq(positionsTable.strategyName, strategy.name))).limit(1);
    if (existing.length > 0) continue;
    const params = strategy.params as { fast?: number; slow?: number; orderUsdt?: number };
    const fast = Math.max(2, params.fast ?? 5);
    const slow = Math.max(fast + 1, params.slow ?? 12);
    const klines = await client.getKlines(strategy.symbol, strategy.interval, slow + 2);
    const closes = klines.map((row) => Number(row.close)).reverse();
    if (closes.length < slow) continue;
    const fastAvg = avg(closes.slice(-fast));
    const slowAvg = avg(closes.slice(-slow));
    const latest = closes.at(-1) ?? 0;
    const momentum = slowAvg > 0 ? ((fastAvg - slowAvg) / slowAvg) * 100 : 0;
    if (fastAvg <= slowAvg || momentum < 0.03) continue;

    const orderUsdt = Math.min(params.orderUsdt ?? 20, Number(risk.maxSingleOrderUsdt), Math.max(0, Number(risk.maxTotalExposureUsdt) - exposure));
    if (orderUsdt < 5) continue;
    state.signalCount += 1;
    await openPosition(strategy, latest, orderUsdt);
    if ((await db.select().from(positionsTable)).length >= risk.maxOpenPositions) break;
  }
}

export async function runAutoTraderCycle() {
  if (state.running) return getAutoTraderState();
  state.running = true;
  state.lastError = null;
  try {
    await ensureDefaultStrategies();
    const risk = await ensureRiskSettings();
    await ensureDailyPnl();
    await updateAndMaybeClosePositions(risk);
    await evaluateEntries(risk);
    state.cycleCount += 1;
    state.lastCycleAt = new Date().toISOString();
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "未知錯誤";
    log("error", state.lastError);
  } finally {
    state.running = false;
  }
  return getAutoTraderState();
}

export function getAutoTraderState() {
  return { ...state, logs: [...state.logs], intervalMs: Number(process.env.AUTO_TRADING_INTERVAL_MS ?? 30000), brokerSyncEnabled: process.env.AUTO_OKX_DEMO_ORDERS === "true" };
}

export function startAutoTrader() {
  state.enabled = true;
  if (!state.startedAt) state.startedAt = new Date().toISOString();
  if (!timer) {
    const intervalMs = Math.max(15000, Number(process.env.AUTO_TRADING_INTERVAL_MS ?? 30000));
    timer = setInterval(() => void runAutoTraderCycle(), intervalMs);
    void runAutoTraderCycle();
    log("info", `OKX Demo 自動交易引擎已啟動 · interval ${intervalMs}ms`);
  }
  return getAutoTraderState();
}

export function stopAutoTrader() {
  state.enabled = false;
  if (timer) clearInterval(timer);
  timer = null;
  log("warn", "OKX Demo 自動交易引擎已停止");
  return getAutoTraderState();
}

export function bootstrapAutoTrader() {
  if (state.enabled) startAutoTrader();
  else log("info", "AUTO_TRADING_ENABLED=false，自動交易引擎保持停止");
}
