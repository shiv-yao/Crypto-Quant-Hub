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
  stopLossMultiplier: number;
  takeProfitMultiplier: number;
  trailingMultiplier: number;
}

interface ShadowTrade {
  id: string;
  profileId: string;
  instId: string;
  side: EvolutionSide;
  regime: EvolutionRegime;
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
  regime: EvolutionRegime;
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
  activeProfileByRegime: Record<EvolutionRegime, string>;
  profiles: EvolutionProfile[];
  shadowTrades: ShadowTrade[];
  outcomes: EvolutionOutcome[];
  promotions: Array<{ time: string; regime: EvolutionRegime; from: string; to: string; improvement: number }>;
  lastEvaluationAt: string | null;
}

const PROFILES: EvolutionProfile[] = [
  { id: "balanced", name: "平衡型", entryScoreOffset: 0, riskScale: 1, stopLossMultiplier: 1, takeProfitMultiplier: 1, trailingMultiplier: 1 },
  { id: "selective", name: "精選型", entryScoreOffset: 4, riskScale: 0.9, stopLossMultiplier: 0.92, takeProfitMultiplier: 1.08, trailingMultiplier: 0.92 },
  { id: "trend", name: "趨勢延伸型", entryScoreOffset: 2, riskScale: 1.05, stopLossMultiplier: 1.05, takeProfitMultiplier: 1.2, trailingMultiplier: 1.1 },
  { id: "defensive", name: "防守型", entryScoreOffset: 5, riskScale: 0.72, stopLossMultiplier: 0.82, takeProfitMultiplier: 0.95, trailingMultiplier: 0.82 },
];

const state: EvolutionState = {
  hydrated: false,
  activeProfileByRegime: { low: "balanced", normal: "balanced", high: "defensive" },
  profiles: PROFILES,
  shadowTrades: [],
  outcomes: [],
  promotions: [],
  lastEvaluationAt: null,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function profile(id: string) {
  return PROFILES.find((item) => item.id === id) ?? PROFILES[0];
}

function persistSnapshot() {
  const details = {
    activeProfileByRegime: state.activeProfileByRegime,
    promotions: state.promotions.slice(0, 50),
    outcomes: state.outcomes.slice(0, 500),
    lastEvaluationAt: state.lastEvaluationAt,
  };
  void db.insert(auditLogsTable).values({
    action: "okx_swap_evolution_snapshot",
    details,
    mode: "okx_demo",
    source: "okx_swap_evolution",
    result: "success",
  }).catch(() => undefined);
}

export async function hydrateEvolutionState() {
  if (state.hydrated) return;
  try {
    const [row] = await db
      .select()
      .from(auditLogsTable)
      .where(eq(auditLogsTable.action, "okx_swap_evolution_snapshot"))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(1);
    const details = row?.details as Partial<EvolutionState> | undefined;
    if (details?.activeProfileByRegime) state.activeProfileByRegime = details.activeProfileByRegime;
    if (Array.isArray(details?.promotions)) state.promotions = details.promotions;
    if (Array.isArray(details?.outcomes)) state.outcomes = details.outcomes;
    state.lastEvaluationAt = details?.lastEvaluationAt ?? null;
  } catch {
    // Database may still be starting. Continue with safe defaults.
  } finally {
    state.hydrated = true;
  }
}

export function applyEvolutionProfile(plan: EvolutionBasePlan): EvolutionBasePlan & { evolutionProfileId: string; evolutionProfileName: string } {
  const selected = profile(state.activeProfileByRegime[plan.volatilityRegime]);
  return {
    ...plan,
    leverage: Math.max(1, Math.min(3, Math.round(plan.leverage * selected.riskScale))),
    notionalUsdt: round(clamp(plan.notionalUsdt * selected.riskScale, 5, 50)),
    stopLossPct: round(clamp(plan.stopLossPct * selected.stopLossMultiplier, 0.7, 5)),
    takeProfitPct: round(clamp(plan.takeProfitPct * selected.takeProfitMultiplier, 1.2, 10)),
    trailingStopPct: round(clamp(plan.trailingStopPct * selected.trailingMultiplier, 0.5, 3)),
    evolutionProfileId: selected.id,
    evolutionProfileName: selected.name,
  };
}

export function registerShadowSignal(input: {
  instId: string;
  side: EvolutionSide;
  score: number;
  price: number;
  plan: EvolutionBasePlan;
}) {
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
      regime: input.plan.volatilityRegime,
      entryPrice: input.price,
      leverage: Math.max(1, Math.min(3, Math.round(input.plan.leverage * candidate.riskScale))),
      stopLossPct: clamp(input.plan.stopLossPct * candidate.stopLossMultiplier, 0.7, 5),
      takeProfitPct: clamp(input.plan.takeProfitPct * candidate.takeProfitMultiplier, 1.2, 10),
      trailingStopPct: clamp(input.plan.trailingStopPct * candidate.trailingMultiplier, 0.5, 3),
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
    state.outcomes.unshift({ profileId: trade.profileId, instId: trade.instId, side: trade.side, regime: trade.regime, pnlPct: round(pnlPct), exitReason, closedAt: new Date().toISOString() });
  }
  state.shadowTrades = keep;
  state.outcomes = state.outcomes.slice(0, 1000);
}

export function recordActualOutcome(input: { instId: string; side: EvolutionSide; regime: EvolutionRegime; pnlPct: number; exitReason: string }) {
  const profileId = state.activeProfileByRegime[input.regime];
  state.outcomes.unshift({ ...input, profileId, pnlPct: round(input.pnlPct), closedAt: new Date().toISOString() });
  state.outcomes = state.outcomes.slice(0, 1000);
  persistSnapshot();
}

export function metricsFor(profileId: string, regime?: EvolutionRegime): EvolutionMetrics {
  const rows = state.outcomes.filter((item) => item.profileId === profileId && (!regime || item.regime === regime)).slice(0, 120);
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
  const minTrades = Math.max(12, Number(process.env.OKX_SWAP_EVOLUTION_MIN_TRADES ?? 24));
  const minImprovement = Math.max(2, Number(process.env.OKX_SWAP_EVOLUTION_MIN_IMPROVEMENT ?? 5));
  for (const regime of ["low", "normal", "high"] as EvolutionRegime[]) {
    const currentId = state.activeProfileByRegime[regime];
    const currentMetrics = metricsFor(currentId, regime);
    const candidates = PROFILES
      .map((item) => ({ item, metrics: metricsFor(item.id, regime) }))
      .filter((item) => item.metrics.trades >= minTrades)
      .sort((a, b) => b.metrics.score - a.metrics.score);
    const best = candidates[0];
    if (!best || best.item.id === currentId) continue;
    const improvement = best.metrics.score - currentMetrics.score;
    if (improvement < minImprovement) continue;
    state.activeProfileByRegime[regime] = best.item.id;
    state.promotions.unshift({ time: new Date().toISOString(), regime, from: currentId, to: best.item.id, improvement: round(improvement) });
  }
  state.lastEvaluationAt = new Date().toISOString();
  persistSnapshot();
  return getEvolutionState();
}

export function getEvolutionState() {
  return {
    hydrated: state.hydrated,
    activeProfileByRegime: state.activeProfileByRegime,
    profiles: PROFILES.map((item) => ({ ...item, metrics: metricsFor(item.id) })),
    shadowOpenTrades: state.shadowTrades.length,
    outcomeCount: state.outcomes.length,
    promotions: state.promotions.slice(0, 20),
    lastEvaluationAt: state.lastEvaluationAt,
    minTrades: Math.max(12, Number(process.env.OKX_SWAP_EVOLUTION_MIN_TRADES ?? 24)),
    minImprovement: Math.max(2, Number(process.env.OKX_SWAP_EVOLUTION_MIN_IMPROVEMENT ?? 5)),
  };
}

export function resetEvolution() {
  state.activeProfileByRegime = { low: "balanced", normal: "balanced", high: "defensive" };
  state.shadowTrades = [];
  state.outcomes = [];
  state.promotions = [];
  state.lastEvaluationAt = null;
  persistSnapshot();
  return getEvolutionState();
}
