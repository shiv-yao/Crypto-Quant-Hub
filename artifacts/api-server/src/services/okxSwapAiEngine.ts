import { createOkxSwapService, contractsForNotional, type OkxSwapInstrument, type OkxSwapKline, type OkxSwapSide, type OkxSwapTicker } from "./okxSwap.js";
import { isOkxSwapSkillEnabled, listOkxSwapSkills } from "./okxSwapSkills.js";

export type SwapSignalAction = "LONG" | "SHORT" | "HOLD";

export interface AdaptiveTradePlan {
  leverage: number;
  notionalUsdt: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  maxHoldMinutes: number;
  exitOnOppositeConfidence: number;
  volatilityRegime: "low" | "normal" | "high";
  reasons: string[];
}

export interface SwapAiSignal {
  instId: string;
  action: SwapSignalAction;
  rawAction: SwapSignalAction;
  score: number;
  confidence: number;
  price: number;
  rsi: number;
  atrPct: number;
  momentumPct: number;
  trendPct: number;
  trend15mPct: number;
  volumeRatio: number;
  mtfAligned: boolean;
  qualityPassed: boolean;
  blockedReasons: string[];
  reasons: string[];
  plan: AdaptiveTradePlan;
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
  peakFavorablePnlPct: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  maxHoldMinutes: number;
  exitOnOppositeConfidence: number;
  openedScore: number;
  lastAiScore: number;
  volatilityRegime: AdaptiveTradePlan["volatilityRegime"];
  openedAt: string;
  externalOrderId: string | null;
}

interface DecisionDebug {
  time: string;
  instId: string;
  action: SwapSignalAction;
  score: number;
  result: "opened" | "blocked" | "hold";
  reasons: string[];
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
  eligibleUniverseCount: number;
  scannedCount: number;
  signalCount: number;
  qualifiedSignalCount: number;
  openedCount: number;
  closedCount: number;
  brokerOrderCount: number;
  realizedPnlPct: number;
  dailyRealizedPnlPct: number;
  dailyKey: string;
  consecutiveLosses: number;
  cooldownUntil: string | null;
  blockedReasonCounts: Record<string, number>;
  recentDecisions: DecisionDebug[];
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
  eligibleUniverseCount: 0,
  scannedCount: 0,
  signalCount: 0,
  qualifiedSignalCount: 0,
  openedCount: 0,
  closedCount: 0,
  brokerOrderCount: 0,
  realizedPnlPct: 0,
  dailyRealizedPnlPct: 0,
  dailyKey: new Date().toISOString().slice(0, 10),
  consecutiveLosses: 0,
  cooldownUntil: null,
  blockedReasonCounts: {},
  recentDecisions: [],
  positions: [],
  latestSignals: [],
  logs: [],
};

let timer: NodeJS.Timeout | null = null;

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function getPositionLimit(): number | null {
  const raw = numberEnv("OKX_SWAP_MAX_POSITIONS", 0);
  return raw > 0 ? Math.floor(raw) : null;
}

function resetDailyIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.dailyKey === today) return;
  state.dailyKey = today;
  state.dailyRealizedPnlPct = 0;
  state.consecutiveLosses = 0;
  state.cooldownUntil = null;
  log("info", "已重置每日風控統計");
}

function log(level: "info" | "warn" | "error", message: string) {
  state.logs.unshift({ time: new Date().toISOString(), level, message });
  state.logs = state.logs.slice(0, 100);
  if (level === "error") console.error(`[okx-swap-ai] ${message}`);
  else console.log(`[okx-swap-ai] ${message}`);
}

function addDecision(instId: string, action: SwapSignalAction, score: number, result: DecisionDebug["result"], reasons: string[]) {
  state.recentDecisions.unshift({ time: new Date().toISOString(), instId, action, score, result, reasons });
  state.recentDecisions = state.recentDecisions.slice(0, 80);
  if (result !== "blocked") return;
  for (const reason of reasons) state.blockedReasonCounts[reason] = (state.blockedReasonCounts[reason] ?? 0) + 1;
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

function trendPct(candles: OkxSwapKline[]): number {
  const closes = [...candles].reverse().map((row) => row.close);
  const fast = ema(closes.slice(-24), 8);
  const slow = ema(closes.slice(-36), 21);
  return slow > 0 ? ((fast - slow) / slow) * 100 : 0;
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

function buildAdaptivePlan(input: { confidence: number; atrPct: number; trendPct: number; momentumPct: number; volumeRatio: number }): AdaptiveTradePlan {
  const maxLeverage = clamp(numberEnv("OKX_SWAP_MAX_LEVERAGE", 2), 1, 3);
  const baseNotional = clamp(numberEnv("OKX_SWAP_POSITION_USDT", 10), 2, 50);
  const maxSingleNotional = clamp(numberEnv("OKX_SWAP_MAX_SINGLE_USDT", 10), 2, 50);
  const volatilityRegime: AdaptiveTradePlan["volatilityRegime"] = input.atrPct >= 2.8 ? "high" : input.atrPct <= 1.1 ? "low" : "normal";
  const trendStrength = Math.abs(input.trendPct) + Math.abs(input.momentumPct) * 0.6;
  const confidenceMultiplier = input.confidence >= 80 ? 1.25 : input.confidence >= 65 ? 1.1 : 0.9;
  const volatilityMultiplier = volatilityRegime === "high" ? 0.55 : volatilityRegime === "low" ? 1.05 : 0.9;
  const volumeMultiplier = input.volumeRatio >= 1.5 ? 1.08 : 0.9;
  const negativeDayMultiplier = state.dailyRealizedPnlPct < 0 ? 0.65 : 1;
  const notionalUsdt = round(clamp(baseNotional * confidenceMultiplier * volatilityMultiplier * volumeMultiplier * negativeDayMultiplier, 2, maxSingleNotional));
  let leverage = 1;
  if (volatilityRegime !== "high" && input.confidence >= 65) leverage = Math.min(2, maxLeverage);
  if (volatilityRegime === "low" && input.confidence >= 88 && trendStrength >= 0.55) leverage = Math.min(3, maxLeverage);
  const stopLossPct = round(clamp(input.atrPct * 1.15 + 0.35, 0.8, 3.2));
  const rewardMultiple = clamp(1.85 + input.confidence / 120, 1.9, 2.6);
  const takeProfitPct = round(clamp(stopLossPct * rewardMultiple, 1.6, 7));
  const trailingStopPct = round(clamp(stopLossPct * 0.58, 0.55, 2.2));
  const maxHoldMinutes = volatilityRegime === "high" ? 60 : trendStrength >= 0.7 ? 240 : 150;
  const exitOnOppositeConfidence = Math.round(clamp(58 + input.confidence * 0.1, 60, 68));
  const reasons = [
    `波動環境 ${volatilityRegime}`,
    `AI 信心 ${input.confidence}%`,
    `動態倉位 ${notionalUsdt} USDT`,
    `動態槓桿 ${leverage}x`,
    `動態停損 ${stopLossPct}%`,
    `動態停利 ${takeProfitPct}%`,
    ...(state.dailyRealizedPnlPct < 0 ? ["今日 PnL 為負，已自動降倉"] : []),
  ];
  return { leverage, notionalUsdt, stopLossPct, takeProfitPct, trailingStopPct, maxHoldMinutes, exitOnOppositeConfidence, volatilityRegime, reasons };
}

function analyze(instId: string, ticker: OkxSwapTicker, candles5m: OkxSwapKline[], candles15m: OkxSwapKline[]): SwapAiSignal {
  const rows = [...candles5m].reverse();
  const closes = rows.map((row) => row.close);
  const volumes = rows.map((row) => row.quoteVolume || row.volume);
  const price = Number(ticker.last || closes.at(-1) || 0);
  const currentTrendPct = trendPct(candles5m);
  const currentTrend15mPct = trendPct(candles15m);
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
  score += clamp(currentTrendPct * 18, -22, 22);
  score += clamp(momentumPct * 10, -18, 18);
  if (rsiValue > 55 && rsiValue < 74) score += 8;
  if (rsiValue < 45 && rsiValue > 26) score -= 8;
  if (rsiValue >= 78) score -= 8;
  if (rsiValue <= 22) score += 8;
  if (volumeRatio >= 1.5) score += currentTrendPct >= 0 ? 7 : -7;
  score = clamp(score, 0, 100);
  const longThreshold = numberEnv("OKX_SWAP_AI_LONG_SCORE", 70);
  const shortThreshold = numberEnv("OKX_SWAP_AI_SHORT_SCORE", 30);
  const rawAction: SwapSignalAction = score >= longThreshold ? "LONG" : score <= shortThreshold ? "SHORT" : "HOLD";
  const confidence = Math.min(99, Math.round(Math.abs(score - 50) * 2));
  const mtfAligned = rawAction === "LONG" ? currentTrendPct > 0 && currentTrend15mPct > 0 : rawAction === "SHORT" ? currentTrendPct < 0 && currentTrend15mPct < 0 : false;
  const blockedReasons: string[] = [];
  if (rawAction === "HOLD") blockedReasons.push("分數未達進場門檻");
  if (rawAction !== "HOLD" && confidence < numberEnv("OKX_SWAP_MIN_CONFIDENCE", 42)) blockedReasons.push("信心不足");
  if (rawAction !== "HOLD" && !mtfAligned) blockedReasons.push("5m 與 15m 趨勢不同向");
  if (rawAction !== "HOLD" && Math.abs(currentTrendPct) < numberEnv("OKX_SWAP_MIN_TREND_STRENGTH", 0.18)) blockedReasons.push("趨勢強度不足");
  if (rawAction === "LONG" && momentumPct <= 0) blockedReasons.push("做多動能未確認");
  if (rawAction === "SHORT" && momentumPct >= 0) blockedReasons.push("做空動能未確認");
  if (rawAction !== "HOLD" && volumeRatio < numberEnv("OKX_SWAP_MIN_VOLUME_RATIO", 0.85)) blockedReasons.push("量能不足");
  if (rawAction !== "HOLD" && atrPct > numberEnv("OKX_SWAP_MAX_ENTRY_ATR_PCT", 3)) blockedReasons.push("ATR 波動過高");
  if (rawAction === "LONG" && (rsiValue < 48 || rsiValue > 76)) blockedReasons.push("做多 RSI 區間不佳");
  if (rawAction === "SHORT" && (rsiValue < 24 || rsiValue > 52)) blockedReasons.push("做空 RSI 區間不佳");
  const qualityPassed = rawAction !== "HOLD" && blockedReasons.length === 0;
  const action: SwapSignalAction = qualityPassed ? rawAction : "HOLD";
  reasons.push(`5m 趨勢 ${currentTrendPct.toFixed(2)}%`, `15m 趨勢 ${currentTrend15mPct.toFixed(2)}%`, `RSI ${rsiValue.toFixed(1)}`, `動能 ${momentumPct.toFixed(2)}%`, `量能倍率 ${volumeRatio.toFixed(2)}x`, `ATR ${atrPct.toFixed(2)}%`);
  const plan = buildAdaptivePlan({ confidence, atrPct, trendPct: currentTrendPct, momentumPct, volumeRatio });
  return { instId, action, rawAction, score: round(score), confidence, price, rsi: round(rsiValue), atrPct: round(atrPct), momentumPct: round(momentumPct), trendPct: round(currentTrendPct), trend15mPct: round(currentTrend15mPct), volumeRatio: round(volumeRatio), mtfAligned, qualityPassed, blockedReasons, reasons, plan, generatedAt: new Date().toISOString() };
}

async function getUniverse() {
  if (!isOkxSwapSkillEnabled("okx.swap.universe")) return [];
  const client = createOkxSwapService();
  const [instruments, tickers] = await Promise.all([client.getSwapInstruments(), client.getSwapTickers()]);
  const instrumentMap = new Map(instruments.map((item) => [item.instId, item]));
  return tickers.filter((ticker) => ticker.instId.endsWith("-USDT-SWAP")).filter((ticker) => instrumentMap.get(ticker.instId)?.state === "live").map((ticker) => ({ ticker, instrument: instrumentMap.get(ticker.instId)! })).sort((left, right) => Number(right.ticker.volCcy24h) - Number(left.ticker.volCcy24h));
}

async function maybeBrokerOrder(instrument: OkxSwapInstrument, side: OkxSwapSide, price: number, notionalUsdt: number, reduceOnly = false, leverage = 1) {
  if (!brokerSyncEnabled() || !isOkxSwapSkillEnabled("okx.swap.demo-executor")) return { contracts: contractsForNotional(instrument, price, notionalUsdt), orderId: null as string | null };
  const client = createPrivateClient();
  if (!client) throw new Error("OKX Demo API Variables 尚未設定完整");
  const contracts = contractsForNotional(instrument, price, notionalUsdt);
  if (!reduceOnly) await client.setLeverage(instrument.instId, leverage, "isolated");
  const result = await client.placeSwapDemoOrder({ instId: instrument.instId, side, contracts, reduceOnly, marginMode: "isolated" });
  state.brokerOrderCount += 1;
  return { contracts, orderId: result.ordId };
}

async function managePositions(universe: Awaited<ReturnType<typeof getUniverse>>) {
  if (!isOkxSwapSkillEnabled("okx.swap.position-manager")) return;
  const tickerMap = new Map(universe.map((item) => [item.ticker.instId, item]));
  const next: SwapAiPosition[] = [];
  const client = createOkxSwapService();
  for (const position of state.positions) {
    const market = tickerMap.get(position.instId);
    if (!market) { next.push(position); continue; }
    const price = Number(market.ticker.last);
    const raw = position.side === "LONG" ? ((price - position.entryPrice) / position.entryPrice) * 100 : ((position.entryPrice - price) / position.entryPrice) * 100;
    const pnlPct = raw * position.leverage;
    const peakFavorablePnlPct = Math.max(position.peakFavorablePnlPct, pnlPct);
    const ageMinutes = (Date.now() - new Date(position.openedAt).getTime()) / 60_000;
    const [candles5m, candles15m] = await Promise.all([client.getSwapKlines(position.instId, "5m", 60), client.getSwapKlines(position.instId, "15m", 60)]);
    const latestSignal = analyze(position.instId, market.ticker, candles5m, candles15m);
    const oppositeSignal = (position.side === "LONG" && latestSignal.rawAction === "SHORT") || (position.side === "SHORT" && latestSignal.rawAction === "LONG");
    const trailingTriggered = peakFavorablePnlPct >= position.trailingStopPct && pnlPct <= peakFavorablePnlPct - position.trailingStopPct;
    const exitReason = pnlPct <= -position.stopLossPct ? `AI 動態停損 ${position.stopLossPct}%` : pnlPct >= position.takeProfitPct ? `AI 動態停利 ${position.takeProfitPct}%` : trailingTriggered ? `AI 追蹤停利回撤 ${position.trailingStopPct}%` : oppositeSignal && latestSignal.confidence >= position.exitOnOppositeConfidence ? `AI 反向訊號 ${latestSignal.rawAction} · 信心 ${latestSignal.confidence}%` : ageMinutes >= position.maxHoldMinutes ? `AI 最大持倉時間 ${position.maxHoldMinutes} 分鐘` : null;
    if (exitReason) {
      await maybeBrokerOrder(market.instrument, position.side, price, position.notionalUsdt, true, position.leverage).catch((error) => log("warn", `Demo 平倉同步失敗 ${position.instId}: ${error instanceof Error ? error.message : "未知錯誤"}`));
      state.closedCount += 1;
      state.realizedPnlPct += pnlPct;
      state.dailyRealizedPnlPct += pnlPct;
      if (pnlPct < 0) {
        state.consecutiveLosses += 1;
        if (state.consecutiveLosses >= numberEnv("OKX_SWAP_MAX_CONSECUTIVE_LOSSES", 2)) {
          const minutes = numberEnv("OKX_SWAP_LOSS_COOLDOWN_MINUTES", 30);
          state.cooldownUntil = new Date(Date.now() + minutes * 60_000).toISOString();
          log("warn", `連續虧損 ${state.consecutiveLosses} 筆，暫停新倉 ${minutes} 分鐘`);
        }
      } else state.consecutiveLosses = 0;
      log("info", `平倉 ${position.instId} ${position.side} · ${exitReason} · PnL ${pnlPct.toFixed(2)}%`);
    } else next.push({ ...position, currentPrice: price, unrealizedPnlPct: round(pnlPct), peakFavorablePnlPct: round(peakFavorablePnlPct), lastAiScore: latestSignal.score });
  }
  state.positions = next;
}

function globalEntryBlocks(): string[] {
  const reasons: string[] = [];
  resetDailyIfNeeded();
  if (!isOkxSwapSkillEnabled("okx.swap.risk-guard")) reasons.push("風控閘門未啟用");
  if (state.dailyRealizedPnlPct <= -Math.abs(numberEnv("OKX_SWAP_DAILY_STOP_PCT", 3))) reasons.push("已觸發每日虧損停止");
  if (state.cooldownUntil) {
    if (new Date(state.cooldownUntil).getTime() > Date.now()) reasons.push("連虧冷卻中");
    else {
      state.cooldownUntil = null;
      state.consecutiveLosses = 0;
    }
  }
  return reasons;
}

async function maybeOpen(signal: SwapAiSignal, instrument: OkxSwapInstrument) {
  const reasons = [...globalEntryBlocks(), ...signal.blockedReasons];
  if (signal.action === "HOLD") {
    addDecision(signal.instId, signal.rawAction, signal.score, signal.rawAction === "HOLD" ? "hold" : "blocked", reasons.length ? reasons : ["等待高品質訊號"]);
    return;
  }
  if (state.positions.some((position) => position.instId === signal.instId)) reasons.push("同一合約已有持倉");
  const positionLimit = getPositionLimit();
  if (positionLimit !== null && state.positions.length >= positionLimit) reasons.push("持倉數已達上限");
  const totalExposure = state.positions.reduce((sum, position) => sum + position.notionalUsdt, 0);
  const maxExposure = clamp(numberEnv("OKX_SWAP_MAX_EXPOSURE_USDT", 500), 20, 500);
  if (totalExposure + signal.plan.notionalUsdt > maxExposure) reasons.push("總曝險已達上限");
  if (reasons.length) {
    addDecision(signal.instId, signal.rawAction, signal.score, "blocked", reasons);
    return;
  }
  const synced = await maybeBrokerOrder(instrument, signal.action, signal.price, signal.plan.notionalUsdt, false, signal.plan.leverage).catch((error) => {
    log("warn", `Demo 開倉同步失敗 ${signal.instId}: ${error instanceof Error ? error.message : "未知錯誤"}`);
    return { contracts: contractsForNotional(instrument, signal.price, signal.plan.notionalUsdt), orderId: null as string | null };
  });
  state.positions.push({ id: `${signal.instId}-${Date.now()}`, instId: signal.instId, side: signal.action, entryPrice: signal.price, currentPrice: signal.price, notionalUsdt: signal.plan.notionalUsdt, contracts: synced.contracts, leverage: signal.plan.leverage, unrealizedPnlPct: 0, peakFavorablePnlPct: 0, stopLossPct: signal.plan.stopLossPct, takeProfitPct: signal.plan.takeProfitPct, trailingStopPct: signal.plan.trailingStopPct, maxHoldMinutes: signal.plan.maxHoldMinutes, exitOnOppositeConfidence: signal.plan.exitOnOppositeConfidence, openedScore: signal.score, lastAiScore: signal.score, volatilityRegime: signal.plan.volatilityRegime, openedAt: new Date().toISOString(), externalOrderId: synced.orderId });
  state.openedCount += 1;
  state.qualifiedSignalCount += 1;
  addDecision(signal.instId, signal.action, signal.score, "opened", ["通過 5m + 15m 與風控確認"]);
  log("info", `建立 ${signal.action} ${signal.instId} · ${signal.plan.notionalUsdt} USDT · ${signal.plan.leverage}x · SL ${signal.plan.stopLossPct}% · TP ${signal.plan.takeProfitPct}%`);
}

export async function runOkxSwapAiCycle() {
  if (state.running) return getOkxSwapAiState();
  state.running = true;
  state.lastError = null;
  try {
    resetDailyIfNeeded();
    const universe = await getUniverse();
    const topLimit = Math.max(5, Math.min(100, numberEnv("OKX_SWAP_TOP_VOLUME_LIMIT", 30)));
    const eligibleUniverse = universe.slice(0, topLimit);
    state.universeCount = universe.length;
    state.eligibleUniverseCount = eligibleUniverse.length;
    await managePositions(universe);
    if (!isOkxSwapSkillEnabled("okx.swap.ai-score")) return getOkxSwapAiState();
    const batchSize = Math.max(3, Math.min(30, numberEnv("OKX_SWAP_SCAN_BATCH", 12)));
    const start = eligibleUniverse.length ? state.cursor % eligibleUniverse.length : 0;
    const batch = eligibleUniverse.slice(start, start + batchSize);
    if (batch.length < batchSize) batch.push(...eligibleUniverse.slice(0, batchSize - batch.length));
    state.cursor = eligibleUniverse.length ? (start + batchSize) % eligibleUniverse.length : 0;
    const signals: SwapAiSignal[] = [];
    const client = createOkxSwapService();
    for (const item of batch) {
      const [candles5m, candles15m] = await Promise.all([client.getSwapKlines(item.instrument.instId, "5m", 60), client.getSwapKlines(item.instrument.instId, "15m", 60)]);
      const signal = analyze(item.instrument.instId, item.ticker, candles5m, candles15m);
      signals.push(signal);
      if (signal.rawAction !== "HOLD") state.signalCount += 1;
      await maybeOpen(signal, item.instrument);
    }
    state.latestSignals = signals.sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50)).slice(0, 30);
    state.scannedCount += batch.length;
    state.cycleCount += 1;
    state.lastCycleAt = new Date().toISOString();
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "未知錯誤";
    log("error", state.lastError);
  } finally { state.running = false; }
  return getOkxSwapAiState();
}

export function getOkxSwapAiState() {
  return { ...state, positions: [...state.positions], latestSignals: [...state.latestSignals], logs: [...state.logs], recentDecisions: [...state.recentDecisions], blockedReasonCounts: { ...state.blockedReasonCounts }, skills: listOkxSwapSkills(), brokerSyncEnabled: brokerSyncEnabled(), intervalMs: Math.max(20_000, numberEnv("OKX_SWAP_AI_INTERVAL_MS", 30_000)), positionLimit: getPositionLimit(), maxExposureUsdt: clamp(numberEnv("OKX_SWAP_MAX_EXPOSURE_USDT", 500), 20, 500), dailyStopPct: Math.abs(numberEnv("OKX_SWAP_DAILY_STOP_PCT", 3)), topVolumeLimit: Math.max(5, Math.min(100, numberEnv("OKX_SWAP_TOP_VOLUME_LIMIT", 30))), adaptiveParametersEnabled: true };
}

export function startOkxSwapAiEngine() {
  state.enabled = true;
  if (!state.startedAt) state.startedAt = new Date().toISOString();
  if (!timer) {
    const intervalMs = Math.max(20_000, numberEnv("OKX_SWAP_AI_INTERVAL_MS", 30_000));
    timer = setInterval(() => void runOkxSwapAiCycle(), intervalMs);
    void runOkxSwapAiCycle();
    log("info", `OKX 合約 AI Demo 引擎已啟動 · 勝率優先模式 · interval ${intervalMs}ms`);
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
