import { createOkxSwapService, contractsForNotional, type OkxSwapInstrument, type OkxSwapSide, type OkxSwapTicker } from "./okxSwap.js";
import { isOkxSwapSkillEnabled, listOkxSwapSkills } from "./okxSwapSkills.js";

export type SwapSignalAction = "LONG" | "SHORT" | "HOLD";

export interface SwapAiSignal {
  instId: string;
  action: SwapSignalAction;
  score: number;
  confidence: number;
  price: number;
  rsi: number;
  atrPct: number;
  momentumPct: number;
  trendPct: number;
  volumeRatio: number;
  reasons: string[];
  generatedAt: string;
}

export interface SwapAiPosition {
  id: string;
  instId: string;
  side: OkxSwapSide;
  entryPrice: number;
  currentPrice: number;
  notionalUsdt: number;
  contracts: string;
  leverage: number;
  unrealizedPnlPct: number;
  openedAt: string;
  externalOrderId: string | null;
}

interface SwapAiState {
  enabled: boolean;
  running: boolean;
  startedAt: string | null;
  lastCycleAt: string | null;
  lastError: string | null;
  cycleCount: number;
  cursor: number;
  universeCount: number;
  scannedCount: number;
  signalCount: number;
  openedCount: number;
  closedCount: number;
  brokerOrderCount: number;
  realizedPnlPct: number;
  positions: SwapAiPosition[];
  latestSignals: SwapAiSignal[];
  logs: Array<{ time: string; level: "info" | "warn" | "error"; message: string }>;
}

const state: SwapAiState = {
  enabled: process.env.OKX_SWAP_AI_ENABLED === "true",
  running: false,
  startedAt: null,
  lastCycleAt: null,
  lastError: null,
  cycleCount: 0,
  cursor: 0,
  universeCount: 0,
  scannedCount: 0,
  signalCount: 0,
  openedCount: 0,
  closedCount: 0,
  brokerOrderCount: 0,
  realizedPnlPct: 0,
  positions: [],
  latestSignals: [],
  logs: [],
};

let timer: NodeJS.Timeout | null = null;

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function log(level: "info" | "warn" | "error", message: string) {
  state.logs.unshift({ time: new Date().toISOString(), level, message });
  state.logs = state.logs.slice(0, 100);
  if (level === "error") console.error(`[okx-swap-ai] ${message}`);
  else console.log(`[okx-swap-ai] ${message}`);
}

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  return values.slice(1).reduce((result, value) => value * k + result * (1 - k), values[0]);
}

function rsi(values: number[], period = 14): number {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const diff = values[index] - values[index - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function createPrivateClient() {
  const apiKey = process.env.OKX_API_KEY ?? "";
  const apiSecret = process.env.OKX_API_SECRET ?? "";
  const passphrase = process.env.OKX_API_PASSPHRASE ?? "";
  if (!apiKey || !apiSecret || !passphrase) return null;
  return createOkxSwapService(apiKey, apiSecret, passphrase, "testnet");
}

function brokerSyncEnabled(): boolean {
  return process.env.OKX_SWAP_DEMO_ORDERS === "true" && process.env.OKX_NETWORK_MODE !== "mainnet";
}

function analyze(instId: string, ticker: OkxSwapTicker, candles: Awaited<ReturnType<ReturnType<typeof createOkxSwapService>["getSwapKlines"]>>): SwapAiSignal {
  const rows = [...candles].reverse();
  const closes = rows.map((row) => row.close);
  const highs = rows.map((row) => row.high);
  const lows = rows.map((row) => row.low);
  const volumes = rows.map((row) => row.quoteVolume || row.volume);
  const price = Number(ticker.last || closes.at(-1) || 0);
  const fast = ema(closes.slice(-24), 8);
  const slow = ema(closes.slice(-36), 21);
  const trendPct = slow > 0 ? ((fast - slow) / slow) * 100 : 0;
  const previous = closes.at(-5) ?? price;
  const momentumPct = previous > 0 ? ((price - previous) / previous) * 100 : 0;
  const rsiValue = rsi(closes, 14);
  const trueRanges = rows.slice(1).map((row, index) => Math.max(row.high - row.low, Math.abs(row.high - rows[index].close), Math.abs(row.low - rows[index].close)));
  const atrPct = price > 0 ? (average(trueRanges.slice(-14)) / price) * 100 : 0;
  const latestVolume = volumes.at(-1) ?? 0;
  const baselineVolume = average(volumes.slice(-21, -1));
  const volumeRatio = baselineVolume > 0 ? latestVolume / baselineVolume : 1;

  let score = 50;
  const reasons: string[] = [];
  score += Math.max(-22, Math.min(22, trendPct * 18));
  score += Math.max(-18, Math.min(18, momentumPct * 10));
  if (rsiValue > 55 && rsiValue < 76) score += 8;
  if (rsiValue < 45 && rsiValue > 24) score -= 8;
  if (rsiValue >= 80) score -= 7;
  if (rsiValue <= 20) score += 7;
  if (volumeRatio >= 1.5) score += trendPct >= 0 ? 7 : -7;
  if (atrPct > 3.5) score += trendPct >= 0 ? -4 : 4;
  score = Math.max(0, Math.min(100, score));

  if (trendPct > 0) reasons.push(`短期 EMA 高於長期 EMA ${trendPct.toFixed(2)}%`);
  else reasons.push(`短期 EMA 低於長期 EMA ${Math.abs(trendPct).toFixed(2)}%`);
  reasons.push(`RSI ${rsiValue.toFixed(1)}`);
  reasons.push(`動能 ${momentumPct.toFixed(2)}%`);
  reasons.push(`量能倍率 ${volumeRatio.toFixed(2)}x`);
  reasons.push(`ATR ${atrPct.toFixed(2)}%`);

  const longThreshold = numberEnv("OKX_SWAP_AI_LONG_SCORE", 67);
  const shortThreshold = numberEnv("OKX_SWAP_AI_SHORT_SCORE", 33);
  const action: SwapSignalAction = score >= longThreshold ? "LONG" : score <= shortThreshold ? "SHORT" : "HOLD";
  const confidence = Math.min(99, Math.round(Math.abs(score - 50) * 2));

  return { instId, action, score: Number(score.toFixed(2)), confidence, price, rsi: Number(rsiValue.toFixed(2)), atrPct: Number(atrPct.toFixed(2)), momentumPct: Number(momentumPct.toFixed(2)), trendPct: Number(trendPct.toFixed(2)), volumeRatio: Number(volumeRatio.toFixed(2)), reasons, generatedAt: new Date().toISOString() };
}

async function getUniverse() {
  if (!isOkxSwapSkillEnabled("okx.swap.universe")) return [];
  const client = createOkxSwapService();
  const [instruments, tickers] = await Promise.all([client.getSwapInstruments(), client.getSwapTickers()]);
  const instrumentMap = new Map(instruments.map((item) => [item.instId, item]));
  return tickers
    .filter((ticker) => ticker.instId.endsWith("-USDT-SWAP"))
    .filter((ticker) => instrumentMap.get(ticker.instId)?.state === "live")
    .map((ticker) => ({ ticker, instrument: instrumentMap.get(ticker.instId)! }))
    .sort((left, right) => Number(right.ticker.volCcy24h) - Number(left.ticker.volCcy24h));
}

async function maybeBrokerOrder(instrument: OkxSwapInstrument, side: OkxSwapSide, price: number, notionalUsdt: number, reduceOnly = false) {
  if (!brokerSyncEnabled() || !isOkxSwapSkillEnabled("okx.swap.demo-executor")) return { contracts: contractsForNotional(instrument, price, notionalUsdt), orderId: null as string | null };
  const client = createPrivateClient();
  if (!client) throw new Error("OKX Demo API Variables 尚未設定完整");
  const contracts = contractsForNotional(instrument, price, notionalUsdt);
  const leverage = Math.max(1, Math.min(3, numberEnv("OKX_SWAP_MAX_LEVERAGE", 2)));
  if (!reduceOnly) await client.setLeverage(instrument.instId, leverage, "isolated");
  const result = await client.placeSwapDemoOrder({ instId: instrument.instId, side, contracts, reduceOnly, marginMode: "isolated" });
  state.brokerOrderCount += 1;
  return { contracts, orderId: result.ordId };
}

async function managePositions(universe: Awaited<ReturnType<typeof getUniverse>>) {
  if (!isOkxSwapSkillEnabled("okx.swap.position-manager")) return;
  const tickerMap = new Map(universe.map((item) => [item.ticker.instId, item]));
  const stopLoss = numberEnv("OKX_SWAP_STOP_LOSS_PCT", 1.5);
  const takeProfit = numberEnv("OKX_SWAP_TAKE_PROFIT_PCT", 3.5);
  const next: SwapAiPosition[] = [];

  for (const position of state.positions) {
    const market = tickerMap.get(position.instId);
    if (!market) { next.push(position); continue; }
    const price = Number(market.ticker.last);
    const raw = position.side === "LONG" ? ((price - position.entryPrice) / position.entryPrice) * 100 : ((position.entryPrice - price) / position.entryPrice) * 100;
    const pnlPct = raw * position.leverage;
    if (pnlPct <= -stopLoss || pnlPct >= takeProfit) {
      await maybeBrokerOrder(market.instrument, position.side, price, position.notionalUsdt, true).catch((error) => log("warn", `Demo 平倉同步失敗 ${position.instId}: ${error instanceof Error ? error.message : "未知錯誤"}`));
      state.closedCount += 1;
      state.realizedPnlPct += pnlPct;
      log("info", `平倉 ${position.instId} ${position.side} · PnL ${pnlPct.toFixed(2)}%`);
    } else {
      next.push({ ...position, currentPrice: price, unrealizedPnlPct: Number(pnlPct.toFixed(2)) });
    }
  }
  state.positions = next;
}

async function maybeOpen(signal: SwapAiSignal, instrument: OkxSwapInstrument) {
  if (!isOkxSwapSkillEnabled("okx.swap.risk-guard") || signal.action === "HOLD") return;
  if (state.positions.some((position) => position.instId === signal.instId)) return;
  const maxPositions = Math.max(1, Math.min(10, numberEnv("OKX_SWAP_MAX_POSITIONS", 3)));
  if (state.positions.length >= maxPositions) return;
  const notionalUsdt = Math.max(5, Math.min(50, numberEnv("OKX_SWAP_POSITION_USDT", 15)));
  const totalExposure = state.positions.reduce((sum, position) => sum + position.notionalUsdt, 0);
  const maxExposure = Math.max(20, Math.min(250, numberEnv("OKX_SWAP_MAX_EXPOSURE_USDT", 60)));
  if (totalExposure + notionalUsdt > maxExposure) return;
  const leverage = Math.max(1, Math.min(3, numberEnv("OKX_SWAP_MAX_LEVERAGE", 2)));
  const synced = await maybeBrokerOrder(instrument, signal.action, signal.price, notionalUsdt).catch((error) => {
    log("warn", `Demo 開倉同步失敗 ${signal.instId}: ${error instanceof Error ? error.message : "未知錯誤"}`);
    return { contracts: contractsForNotional(instrument, signal.price, notionalUsdt), orderId: null as string | null };
  });
  state.positions.push({ id: `${signal.instId}-${Date.now()}`, instId: signal.instId, side: signal.action, entryPrice: signal.price, currentPrice: signal.price, notionalUsdt, contracts: synced.contracts, leverage, unrealizedPnlPct: 0, openedAt: new Date().toISOString(), externalOrderId: synced.orderId });
  state.openedCount += 1;
  log("info", `建立 ${signal.action} ${signal.instId} · ${notionalUsdt} USDT · ${leverage}x`);
}

export async function runOkxSwapAiCycle() {
  if (state.running) return getOkxSwapAiState();
  state.running = true;
  state.lastError = null;
  try {
    const universe = await getUniverse();
    state.universeCount = universe.length;
    await managePositions(universe);
    if (!isOkxSwapSkillEnabled("okx.swap.ai-score")) return getOkxSwapAiState();
    const batchSize = Math.max(3, Math.min(30, numberEnv("OKX_SWAP_SCAN_BATCH", 10)));
    const start = universe.length ? state.cursor % universe.length : 0;
    const batch = universe.slice(start, start + batchSize);
    if (batch.length < batchSize) batch.push(...universe.slice(0, batchSize - batch.length));
    state.cursor = universe.length ? (start + batchSize) % universe.length : 0;
    const signals: SwapAiSignal[] = [];
    const client = createOkxSwapService();
    for (const item of batch) {
      const candles = await client.getSwapKlines(item.instrument.instId, "5m", 60);
      const signal = analyze(item.instrument.instId, item.ticker, candles);
      signals.push(signal);
      if (signal.action !== "HOLD") {
        state.signalCount += 1;
        await maybeOpen(signal, item.instrument);
      }
    }
    state.latestSignals = signals.sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50)).slice(0, 30);
    state.scannedCount += batch.length;
    state.cycleCount += 1;
    state.lastCycleAt = new Date().toISOString();
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "未知錯誤";
    log("error", state.lastError);
  } finally {
    state.running = false;
  }
  return getOkxSwapAiState();
}

export function getOkxSwapAiState() {
  return { ...state, positions: [...state.positions], latestSignals: [...state.latestSignals], logs: [...state.logs], skills: listOkxSwapSkills(), brokerSyncEnabled: brokerSyncEnabled(), intervalMs: Math.max(20_000, numberEnv("OKX_SWAP_AI_INTERVAL_MS", 45_000)) };
}

export function startOkxSwapAiEngine() {
  state.enabled = true;
  if (!state.startedAt) state.startedAt = new Date().toISOString();
  if (!timer) {
    const intervalMs = Math.max(20_000, numberEnv("OKX_SWAP_AI_INTERVAL_MS", 45_000));
    timer = setInterval(() => void runOkxSwapAiCycle(), intervalMs);
    void runOkxSwapAiCycle();
    log("info", `OKX 合約 AI Demo 引擎已啟動 · interval ${intervalMs}ms`);
  }
  return getOkxSwapAiState();
}

export function stopOkxSwapAiEngine() {
  state.enabled = false;
  if (timer) clearInterval(timer);
  timer = null;
  log("warn", "OKX 合約 AI Demo 引擎已停止");
  return getOkxSwapAiState();
}

export function bootstrapOkxSwapAiEngine() {
  if (state.enabled) startOkxSwapAiEngine();
  else log("info", "OKX_SWAP_AI_ENABLED 未開啟，合約 AI 引擎保持停止");
}
