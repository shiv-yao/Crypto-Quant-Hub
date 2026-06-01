import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Bot, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";

interface Metrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  averagePnlPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  score: number;
}

interface Profile {
  id: string;
  name: string;
  entryScoreOffset: number;
  riskScale: number;
  maxLeverage: number;
  description: string;
  metrics: Metrics;
}

interface EvolutionState {
  hydrated: boolean;
  runtimeProfileId: string;
  runtimeProfileName: string;
  recommendedProfileId: string | null;
  recommendedProfileName: string | null;
  profiles: Profile[];
  shadowOpenTrades: number;
  outcomeCount: number;
  approvals: Array<{ time: string; from: string; to: string; improvement: number }>;
  lastEvaluationAt: string | null;
  minTrades: number;
  minImprovement: number;
  runtimeParameters: {
    longScore: number;
    shortScore: number;
    basePositionUsdt: number;
    maxSingleUsdt: number;
    maxLeverage: number;
  };
}

interface DashboardState {
  enabled: boolean;
  running: boolean;
  startedAt: string | null;
  lastCycleAt: string | null;
  lastError: string | null;
  cycleCount: number;
  scannedCount: number;
  universeCount: number;
  intervalMs: number;
  sendsOrders: boolean;
  autoApplyRecommendations: boolean;
  evolution: EvolutionState;
  logs: Array<{ time: string; level: "info" | "warn" | "error"; message: string }>;
}

async function api<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({ error: "Response was not valid JSON" }));
  if (!response.ok) throw new Error(payload.error ?? JSON.stringify(payload));
  return payload as T;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold font-mono text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function pct(value: number) {
  return `${value.toFixed(2)}%`;
}

function metricTone(value: number, positive = true) {
  if (value === 0) return "text-muted-foreground";
  const good = positive ? value > 0 : value < 0;
  return good ? "text-emerald-400" : "text-red-400";
}

export default function OkxShadowLearning() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [message, setMessage] = useState("Loading read-only shadow learner...");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<DashboardState>("/api/okx-swap-shadow/status");
      setState(data);
      setMessage(data.enabled ? "Shadow learning is running in read-only mode." : "Shadow learning is currently stopped.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to read shadow learning status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const evolution = state?.evolution;

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">OKX Shadow Learning</h1>
          <p className="mt-1 text-xs text-muted-foreground">Read-only public-market simulation · candidate comparison · no orders · no parameter mutation</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300 leading-relaxed">
        <div className="flex items-start gap-2">
          <ShieldCheck size={15} className="mt-0.5 flex-shrink-0" />
          <span>This dashboard is read-only. The learner reads OKX public market data and simulates shadow trades only. It cannot place orders, change live parameters, or apply recommendations automatically.</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Learner status" value={state?.enabled ? "Running" : "Stopped"} sub={state?.running ? "Cycle in progress" : "Idle"} />
        <Stat label="USDT swap universe" value={state?.universeCount ?? 0} sub="Public OKX market data" />
        <Stat label="Scanned markets" value={state?.scannedCount ?? 0} sub={`Every ${Math.round((state?.intervalMs ?? 60000) / 1000)} seconds`} />
        <Stat label="Completed shadow samples" value={evolution?.outcomeCount ?? 0} sub={`Minimum ${evolution?.minTrades ?? 0} per profile`} />
        <Stat label="Open shadow trades" value={evolution?.shadowOpenTrades ?? 0} />
        <Stat label="Candidate profiles" value={evolution?.profiles.length ?? 0} />
        <Stat label="Runtime profile" value={evolution?.runtimeProfileName ?? "-"} sub="Reference only" />
        <Stat label="Recommendation" value={evolution?.recommendedProfileName ?? "None"} sub="Display only" />
      </div>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2"><Bot size={14} className="text-primary" /><h2 className="text-sm font-semibold text-foreground">Learner health</h2></div>
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="rounded-md bg-background p-3">Started: {state?.startedAt ? new Date(state.startedAt).toLocaleString() : "Not started"}</div>
          <div className="rounded-md bg-background p-3">Last cycle: {state?.lastCycleAt ? new Date(state.lastCycleAt).toLocaleString() : "Not run yet"}</div>
          <div className="rounded-md bg-background p-3">Last evaluation: {evolution?.lastEvaluationAt ? new Date(evolution.lastEvaluationAt).toLocaleString() : "Not evaluated yet"}</div>
          <div className="rounded-md bg-background p-3">Recommendation threshold: +{evolution?.minImprovement ?? 0} score points</div>
        </div>
        <div className="rounded-md bg-background p-3 text-xs font-mono text-muted-foreground">{message}</div>
        {state?.lastError && <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"><AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />{state.lastError}</div>}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2"><BarChart3 size={14} className="text-primary" /><h2 className="text-sm font-semibold text-foreground">Candidate profiles</h2></div>
        <div className="space-y-3">
          {(evolution?.profiles ?? []).map((profile) => {
            const active = profile.id === evolution?.runtimeProfileId;
            const recommended = profile.id === evolution?.recommendedProfileId;
            return (
              <div key={profile.id} className="rounded-md border border-border/60 bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold text-foreground">{profile.name}</p>
                      {active && <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">Reference</span>}
                      {recommended && <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">Recommended</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{profile.description}</p>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">score {profile.metrics.score.toFixed(2)}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono sm:grid-cols-4 lg:grid-cols-7">
                  <span className="text-muted-foreground">Trades {profile.metrics.trades}</span>
                  <span className="text-muted-foreground">Wins {profile.metrics.wins}</span>
                  <span className="text-muted-foreground">Losses {profile.metrics.losses}</span>
                  <span className={metricTone(profile.metrics.winRate)}>Win {pct(profile.metrics.winRate)}</span>
                  <span className={metricTone(profile.metrics.averagePnlPct)}>Avg {pct(profile.metrics.averagePnlPct)}</span>
                  <span className={metricTone(profile.metrics.profitFactor - 1)}>PF {profile.metrics.profitFactor.toFixed(2)}</span>
                  <span className={profile.metrics.maxDrawdownPct > 0 ? "text-amber-400" : "text-muted-foreground"}>DD {pct(profile.metrics.maxDrawdownPct)}</span>
                </div>
                <div className="mt-2 text-xs font-mono text-muted-foreground">Entry offset {profile.entryScoreOffset} · Risk scale {profile.riskScale.toFixed(2)} · Max leverage {profile.maxLeverage}x</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Reference parameters</h2>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono text-muted-foreground sm:grid-cols-5">
          <div className="rounded-md bg-background p-3">LONG ≥ {evolution?.runtimeParameters.longScore ?? "-"}</div>
          <div className="rounded-md bg-background p-3">SHORT ≤ {evolution?.runtimeParameters.shortScore ?? "-"}</div>
          <div className="rounded-md bg-background p-3">Base {evolution?.runtimeParameters.basePositionUsdt ?? "-"} USDT</div>
          <div className="rounded-md bg-background p-3">Single max {evolution?.runtimeParameters.maxSingleUsdt ?? "-"} USDT</div>
          <div className="rounded-md bg-background p-3">Leverage max {evolution?.runtimeParameters.maxLeverage ?? "-"}x</div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Recent learner logs</h2>
        {!state?.logs.length ? <p className="text-xs text-muted-foreground">No logs yet.</p> : state.logs.slice(0, 20).map((item, index) => (
          <div key={`${item.time}-${index}`} className="rounded-md border border-border/50 bg-background p-3 text-xs">
            <div className="flex items-center gap-2">
              {item.level === "info" ? <CheckCircle2 size={13} className="text-emerald-400" /> : <AlertTriangle size={13} className={item.level === "warn" ? "text-amber-400" : "text-red-400"} />}
              <span className="font-mono text-muted-foreground">{new Date(item.time).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-foreground">{item.message}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
