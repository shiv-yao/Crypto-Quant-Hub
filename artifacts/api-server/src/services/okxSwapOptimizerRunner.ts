import { createOkxSwapService, type OkxSwapKline, type OkxSwapTicker } from "./okxSwap.js";
import {
  evaluateEvolution,
  getEvolutionState,
  hydrateEvolutionState,
  registerShadowSignal,
  updateShadowTrades,
} from "./okxSwapEvolution.js";

interface OptimizerState {
  enabled: boolean;
  running: boolean;
  startedAt: string | null;
  lastCycleAt: string | null;
  lastError: string | null;
  cycleCount: number;
  scannedCount: number;
  universeCount: number;
  cursor: number;
  logs: Array<{ time: string; level: "info" | "warn" | "error"; message: string }>;
}

const state: OptimizerState = {
  enabled: process.env.OKX_SWAP_OPTIMIZER_ENABLED === "true",
  running: false,
  startedAt: null,
  lastCycleAt: null,
  lastError: null,
  cycleCount: 0,
  scannedCount: 0,
  universeCount: 0,
  cursor: 0,
  logs: [],
};

let timer: NodeJS.Timeout | null = null;

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0;
}

function ema(values: number[], period: number) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  return values.slice(1).reduce((result, value) => value * k + result * (1 - k), values[0]);
}

function rsi(values: number[], period = 14) {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const diff = values[index] - values[index - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (!losses) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function log(level: "info" | "warn" | "error", message: string) {
  state.logs.unshift({ time: new Date().toISOString(), level, message });
  state.logs = state.logs.slice(0, 80);
  if (level === "error") console.error(`[okx-swap-optimizer] ${message}`);
  else console.log(`[okx-swap-optimizer] ${message}`);
}

function scoreSignal(ticker: OkxSwapTicker, candles: OkxSwapKline[]) {
  const rows = [...candles].reverse();
  const closes = rows.map((item) => item.close);
  const volumes = rows.map((item) => item.quoteVolume || item.volume);
  const price = Number(ticker.last || closes.at(-1) || 0);
  const fast = ema(closes.slice(-24), 8);
  const slow = ema(closes.slice(-36), 21);
  const trendPct = slow > 0 ? ((fast - slow) / slow) * 100 : 0;
  const previous = closes.at(-5) ?? price;
  const momentumPct = previous > 0 ? ((price - previous) / previous) * 100 : 0;
  const rsiValue = rsi(closes);
  const trueRanges = rows.slice(1).map((row, index) => Math.max(row.high - row.low, Math.abs(row.high - rows[index].close), Math.abs(row.low - rows[index].close)));
  const atrPct = price > 0 ? (average(trueRanges.slice(-14)) / price) * 100 : 0;
  const volumeRatio = average(volumes.slice(-21, -1)) > 0 ? (volumes.at(-1) ?? 0) / average(volumes.slice(-21, -1)) : 1;
  let score = 50;
  score += clamp(trendPct * 18, -22, 22);
  score += clamp(momentumPct * 10, -18, 18);
  if (rsiValue > 55 && rsiValue < 76) score += 8;
  if (rsiValue < 45 && rsiValue > 24) score -= 8;
  if (rsiValue >= 80) score -= 7;
  if (rsiValue <= 20) score += 7;
  if (volumeRatio >= 1.5) score += trendPct >= 0 ? 7 : -7;
  score = clamp(score, 0, 100);
  const confidence = Math.min(99, Math.round(Math.abs(score - 50) * 2));
  const volatilityRegime = atrPct >= 2.8 ? "high" as const : atrPct <= 1.1 ? "low" as const : "normal" as const;
  const stopLossPct = clamp(atrPct * 1.35 + 0.45, 0.9, 4.5);
  return {
    price,
    score,
    action: score >= 63 ? "LONG" as const : score <= 37 ? "SHORT" as const : "HOLD" as const,
    plan: {
      leverage: volatilityRegime === "high" ? 1 : confidence >= 55 ? 2 : 1,
      notionalUsdt: 10,
      stopLossPct,
      takeProfitPct: clamp(stopLossPct * (1.65 + confidence / 100), 1.8, 9),
      trailingStopPct: clamp(stopLossPct * 0.62, 0.65, 2.8),
      maxHoldMinutes: volatilityRegime === "high" ? 90 : 180,
      exitOnOppositeConfidence: 60,
      volatilityRegime,
    },
  };
}

async function getUniverse() {
  const client = createOkxSwapService();
  const [instruments, tickers] = await Promise.all([client.getSwapInstruments(), client.getSwapTickers()]);
  const live = new Set(instruments.filter((item) => item.state === "live").map((item) => item.instId));
  return tickers
    .filter((item) => item.instId.endsWith("-USDT-SWAP"))
    .filter((item) => live.has(item.instId))
    .sort((a, b) => Number(b.volCcy24h) - Number(a.volCcy24h));
}

export async function runOkxSwapOptimizerCycle() {
  if (state.running) return getOkxSwapOptimizerState();
  state.running = true;
  state.lastError = null;
  try {
    await hydrateEvolutionState();
    const universe = await getUniverse();
    state.universeCount = universe.length;
    updateShadowTrades(new Map(universe.map((item) => [item.instId, Number(item.last)])));
    const batchSize = clamp(numberEnv("OKX_SWAP_OPTIMIZER_SCAN_BATCH", 12), 3, 30);
    const start = universe.length ? state.cursor % universe.length : 0;
    const batch = universe.slice(start, start + batchSize);
    if (batch.length < batchSize) batch.push(...universe.slice(0, batchSize - batch.length));
    state.cursor = universe.length ? (start + batchSize) % universe.length : 0;
    const client = createOkxSwapService();
    for (const ticker of batch) {
      const candles = await client.getSwapKlines(ticker.instId, "5m", 60);
      const signal = scoreSignal(ticker, candles);
      if (signal.action === "HOLD") continue;
      registerShadowSignal({ instId: ticker.instId, side: signal.action, score: signal.score, price: signal.price, plan: signal.plan });
    }
    state.scannedCount += batch.length;
    state.cycleCount += 1;
    if (state.cycleCount % 10 === 0) evaluateEvolution();
    state.lastCycleAt = new Date().toISOString();
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "未知錯誤";
    log("error", state.lastError);
  } finally {
    state.running = false;
  }
  return getOkxSwapOptimizerState();
}

export function getOkxSwapOptimizerState() {
  return {
    ...state,
    logs: [...state.logs],
    intervalMs: Math.max(20_000, numberEnv("OKX_SWAP_OPTIMIZER_INTERVAL_MS", 60_000)),
    evolution: getEvolutionState(),
    sendsOrders: false,
    autoApplyRecommendations: false,
  };
}

export function startOkxSwapOptimizer() {
  state.enabled = true;
  if (!state.startedAt) state.startedAt = new Date().toISOString();
  if (!timer) {
    const intervalMs = Math.max(20_000, numberEnv("OKX_SWAP_OPTIMIZER_INTERVAL_MS", 60_000));
    timer = setInterval(() => void runOkxSwapOptimizerCycle(), intervalMs);
    void runOkxSwapOptimizerCycle();
    log("info", `OKX 影子參數驗證已啟動 · interval ${intervalMs}ms`);
  }
  return getOkxSwapOptimizerState();
}

export function stopOkxSwapOptimizer() {
  state.enabled = false;
  if (timer) clearInterval(timer);
  timer = null;
  log("warn", "OKX 影子參數驗證已停止");
  return getOkxSwapOptimizerState();
}

export function bootstrapOkxSwapOptimizer() {
  if (state.enabled) startOkxSwapOptimizer();
  else log("info", "OKX_SWAP_OPTIMIZER_ENABLED 未開啟，影子參數驗證保持停止");
}
