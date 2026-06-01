import { desc, eq } from "drizzle-orm";
import { db, auditLogsTable } from "@workspace/db";

export type EvolutionRegime = "low" | "normal" | "high";
export type EvolutionSide = "LONG" | "SHORT";

export interface EvolutionBasePlan {
  leverage: number;
  notionalUsdt: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  maxHoldMinutes: number;
  exitOnOppositeConfidence: number;
  volatilityRegime: EvolutionRegime;
}

interface EvolutionProfile {
  id: string;
  name: string;
  entryScoreOffset: number;
  riskScale: number;
  maxLeverage: number;
  description: string;
}

interface ShadowTrade {
  id: string;
  profileId: string;
  instId: string;
  side: EvolutionSide;
  entryPrice: number;
  leverage: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  maxHoldMinutes: number;
  peakPnlPct: number;
  openedAt: string;
}

interface EvolutionOutcome {
  profileId: string;
  instId: string;
  side: EvolutionSide;
  pnlPct: number;
  exitReason: string;
  closedAt: string;
}

export interface EvolutionMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  averagePnlPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  score: number;
}

interface EvolutionState {
  hydrated: boolean;
  runtimeProfileId: string;
  recommendedProfileId: string | null;
  shadowTrades: ShadowTrade[];
  outcomes: EvolutionOutcome[];
  approvals: Array<{ time: string; from: string; to: string; improvement: number }>;
  lastEvaluationAt: string | null;
}

const PROFILES: EvolutionProfile[] = [
  { id: "balanced", name: "平衡型", entryScoreOffset: 0, riskScale: 1, maxLeverage: 2, description: "作為基準參數組，兼顧觸發率與風控。" },
  { id: "selective", name: "精選型", entryScoreOffset: 4, riskScale: 0.9, maxLeverage: 2, description: "提高進場門檻，減少低品質訊號。" },
  { id: "trend", name: "趨勢型", entryScoreOffset: 2, riskScale: 1.05, maxLeverage: 2, description: "保留趨勢訊號，適度提高基準倉位。" },
  { id: "defensive", name: "防守型", entryScoreOffset: 5, riskScale: 0.72, maxLeverage: 1, description: "降低倉位與槓桿，優先壓低回撤。" },
];

const state: EvolutionState = {
  hydrated: false,
  runtimeProfileId: "balanced",
  recommendedProfileId: null,
  shadowTrades: [],
  outcomes: [],
  approvals: [],
  lastEvaluationAt: null,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function safeNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function profile(id: string) {
  return PROFILES.find((item) => item.id === id) ?? PROFILES[0];
}

function persistSnapshot() {
  void db.insert(auditLogsTable).values({
    action: "okx_swap_shadow_optimizer_snapshot",
    details: {
      runtimeProfileId: state.runtimeProfileId,
      recommendedProfileId: state.recommendedProfileId,
      approvals: state.approvals.slice(0, 50),
      outcomes: state.outcomes.slice(0, 500),
      lastEvaluationAt: state.lastEvaluationAt,
    },
    mode: "okx_demo",
    source: "okx_swap_shadow_optimizer",
    result: "success",
  }).catch(() => undefined);
}

export async function hydrateEvolutionState() {
  if (state.hydrated) return;
  try {
    const [row] = await db
      .select()
      .from(auditLogsTable)
      .where(eq(auditLogsTable.action, "okx_swap_shadow_optimizer_snapshot"))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(1);
    const details = row?.details as Partial<EvolutionState> | undefined;
    if (details?.runtimeProfileId) state.runtimeProfileId = details.runtimeProfileId;
    if (typeof details?.recommendedProfileId === "string" || details?.recommendedProfileId === null) state.recommendedProfileId = details.recommendedProfileId ?? null;
    if (Array.isArray(details?.approvals)) state.approvals = details.approvals;
    if (Array.isArray(details?.outcomes)) state.outcomes = details.outcomes;
    state.lastEvaluationAt = details?.lastEvaluationAt ?? null;
  } catch {
    // Database may still be starting. Continue with safe defaults.
  } finally {
    state.hydrated = true;
  }
}

export function registerShadowSignal(input: { instId: string; side: EvolutionSide; score: number; price: number; plan: EvolutionBasePlan }) {
  for (const candidate of PROFILES) {
    const threshold = input.side === "LONG" ? 63 + candidate.entryScoreOffset : 37 - candidate.entryScoreOffset;
    const accepted = input.side === "LONG" ? input.score >= threshold : input.score <= threshold;
    if (!accepted) continue;
    if (state.shadowTrades.some((item) => item.profileId === candidate.id && item.instId === input.instId)) continue;
    state.shadowTrades.push({
      id: `${candidate.id}-${input.instId}-${Date.now()}`,
      profileId: candidate.id,
      instId: input.instId,
      side: input.side,
      entryPrice: input.price,
      leverage: Math.max(1, Math.min(candidate.maxLeverage, Math.round(input.plan.leverage * candidate.riskScale))),
      stopLossPct: clamp(input.plan.stopLossPct, 0.7, 5),
      takeProfitPct: clamp(input.plan.takeProfitPct, 1.2, 10),
      trailingStopPct: clamp(input.plan.trailingStopPct, 0.5, 3),
      maxHoldMinutes: input.plan.maxHoldMinutes,
      peakPnlPct: 0,
      openedAt: new Date().toISOString(),
    });
  }
}

export function updateShadowTrades(priceByInstrument: Map<string, number>) {
  const keep: ShadowTrade[] = [];
  const now = Date.now();
  for (const trade of state.shadowTrades) {
    const price = priceByInstrument.get(trade.instId);
    if (!price) { keep.push(trade); continue; }
    const raw = trade.side === "LONG" ? ((price - trade.entryPrice) / trade.entryPrice) * 100 : ((trade.entryPrice - price) / trade.entryPrice) * 100;
    const pnlPct = raw * trade.leverage;
    const peak = Math.max(trade.peakPnlPct, pnlPct);
    const ageMinutes = (now - new Date(trade.openedAt).getTime()) / 60_000;
    const exitReason = pnlPct <= -trade.stopLossPct
      ? "shadow_stop_loss"
      : pnlPct >= trade.takeProfitPct
        ? "shadow_take_profit"
        : peak >= trade.trailingStopPct && pnlPct <= peak - trade.trailingStopPct
          ? "shadow_trailing_stop"
          : ageMinutes >= trade.maxHoldMinutes
            ? "shadow_max_hold"
            : null;
    if (!exitReason) {
      keep.push({ ...trade, peakPnlPct: peak });
      continue;
    }
    state.outcomes.unshift({ profileId: trade.profileId, instId: trade.instId, side: trade.side, pnlPct: round(pnlPct), exitReason, closedAt: new Date().toISOString() });
  }
  state.shadowTrades = keep;
  state.outcomes = state.outcomes.slice(0, 1000);
}

export function metricsFor(profileId: string): EvolutionMetrics {
  const rows = state.outcomes.filter((item) => item.profileId === profileId).slice(0, 120);
  const wins = rows.filter((item) => item.pnlPct > 0);
  const losses = rows.filter((item) => item.pnlPct <= 0);
  const grossProfit = wins.reduce((sum, item) => sum + item.pnlPct, 0);
  const grossLoss = Math.abs(losses.reduce((sum, item) => sum + item.pnlPct, 0));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const item of [...rows].reverse()) {
    equity += item.pnlPct;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const trades = rows.length;
  const winRate = trades ? (wins.length / trades) * 100 : 0;
  const averagePnlPct = trades ? rows.reduce((sum, item) => sum + item.pnlPct, 0) / trades : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const score = trades ? winRate * 0.45 + averagePnlPct * 12 + Math.min(profitFactor, 4) * 8 - maxDrawdown * 1.8 : 0;
  return { trades, wins: wins.length, losses: losses.length, winRate: round(winRate), averagePnlPct: round(averagePnlPct), profitFactor: round(profitFactor), maxDrawdownPct: round(maxDrawdown), score: round(score) };
}

export function evaluateEvolution() {
  const minTrades = Math.max(12, safeNumber(process.env.OKX_SWAP_OPTIMIZER_MIN_TRADES, 24));
  const minImprovement = Math.max(2, safeNumber(process.env.OKX_SWAP_OPTIMIZER_MIN_IMPROVEMENT, 5));
  const current = metricsFor(state.runtimeProfileId);
  const candidates = PROFILES
    .map((item) => ({ item, metrics: metricsFor(item.id) }))
    .filter((item) => item.metrics.trades >= minTrades)
    .sort((a, b) => b.metrics.score - a.metrics.score);
  const best = candidates[0];
  state.recommendedProfileId = best && best.item.id !== state.runtimeProfileId && best.metrics.score - current.score >= minImprovement ? best.item.id : null;
  state.lastEvaluationAt = new Date().toISOString();
  persistSnapshot();
  return getEvolutionState();
}

export function applyRecommendation() {
  if (!state.recommendedProfileId) throw new Error("目前沒有通過影子驗證的參數建議");
  const previous = state.runtimeProfileId;
  const next = profile(state.recommendedProfileId);
  const improvement = round(metricsFor(next.id).score - metricsFor(previous).score);
  state.runtimeProfileId = next.id;
  state.recommendedProfileId = null;
  state.approvals.unshift({ time: new Date().toISOString(), from: previous, to: next.id, improvement });
  process.env.OKX_SWAP_AI_LONG_SCORE = String(63 + next.entryScoreOffset);
  process.env.OKX_SWAP_AI_SHORT_SCORE = String(37 - next.entryScoreOffset);
  process.env.OKX_SWAP_POSITION_USDT = String(round(clamp(10 * next.riskScale, 5, 30)));
  process.env.OKX_SWAP_MAX_SINGLE_USDT = String(round(clamp(30 * next.riskScale, 10, 50)));
  process.env.OKX_SWAP_MAX_LEVERAGE = String(next.maxLeverage);
  persistSnapshot();
  return getEvolutionState();
}

export function getEvolutionState() {
  const runtime = profile(state.runtimeProfileId);
  return {
    hydrated: state.hydrated,
    runtimeProfileId: state.runtimeProfileId,
    runtimeProfileName: runtime.name,
    recommendedProfileId: state.recommendedProfileId,
    recommendedProfileName: state.recommendedProfileId ? profile(state.recommendedProfileId).name : null,
    profiles: PROFILES.map((item) => ({ ...item, metrics: metricsFor(item.id) })),
    shadowOpenTrades: state.shadowTrades.length,
    outcomeCount: state.outcomes.length,
    approvals: state.approvals.slice(0, 20),
    lastEvaluationAt: state.lastEvaluationAt,
    minTrades: Math.max(12, safeNumber(process.env.OKX_SWAP_OPTIMIZER_MIN_TRADES, 24)),
    minImprovement: Math.max(2, safeNumber(process.env.OKX_SWAP_OPTIMIZER_MIN_IMPROVEMENT, 5)),
    runtimeParameters: {
      longScore: safeNumber(process.env.OKX_SWAP_AI_LONG_SCORE, 63),
      shortScore: safeNumber(process.env.OKX_SWAP_AI_SHORT_SCORE, 37),
      basePositionUsdt: safeNumber(process.env.OKX_SWAP_POSITION_USDT, 10),
      maxSingleUsdt: safeNumber(process.env.OKX_SWAP_MAX_SINGLE_USDT, 30),
      maxLeverage: safeNumber(process.env.OKX_SWAP_MAX_LEVERAGE, 2),
    },
  };
}

export function resetEvolution() {
  state.runtimeProfileId = "balanced";
  state.recommendedProfileId = null;
  state.shadowTrades = [];
  state.outcomes = [];
  state.approvals = [];
  state.lastEvaluationAt = null;
  persistSnapshot();
  return getEvolutionState();
}
