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
  const payload = await response.json().catch(() => ({ error: "伺服器回傳的內容不是有效 JSON" }));
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
  const [message, setMessage] = useState("正在讀取唯讀影子學習狀態...");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<DashboardState>("/api/okx-swap-shadow/status");
      setState(data);
      setMessage(data.enabled ? "影子學習正在以唯讀模式執行。" : "影子學習目前已停止。"
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法讀取影子學習狀態");
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
          <h1 className="text-xl font-bold text-foreground">OKX 影子學習</h1>
          <p className="mt-1 text-xs text-muted-foreground">唯讀公開市場模擬 · 候選參數比較 · 不送單 · 不修改交易參數</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50">
          <RefreshCw size={13} /> 重新整理
        </button>
      </div>

      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300 leading-relaxed">
        <div className="flex items-start gap-2">
          <ShieldCheck size={15} className="mt-0.5 flex-shrink-0" />
          <span>這個頁面是唯讀儀表板。學習器只會讀取 OKX 公開行情並進行影子模擬，不會送出訂單、不會修改交易參數，也不會自動套用任何建議。</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="學習器狀態" value={state?.enabled ? "執行中" : "已停止"} sub={state?.running ? "正在執行掃描" : "等待下一輪"} />
        <Stat label="USDT 永續合約幣種" value={state?.universeCount ?? 0} sub="OKX 公開行情" />
        <Stat label="累積掃描市場" value={state?.scannedCount ?? 0} sub={`每 ${Math.round((state?.intervalMs ?? 60000) / 1000)} 秒掃描一次`} />
        <Stat label="已完成影子樣本" value={evolution?.outcomeCount ?? 0} sub={`每組至少需要 ${evolution?.minTrades ?? 0} 筆`} />
        <Stat label="進行中的影子交易" value={evolution?.shadowOpenTrades ?? 0} />
        <Stat label="候選參數組" value={evolution?.profiles.length ?? 0} />
        <Stat label="目前參考參數組" value={evolution?.runtimeProfileName ?? "-"} sub="僅供參考" />
        <Stat label="目前建議" value={evolution?.recommendedProfileName ?? "暫無建議"} sub="只顯示，不會自動套用" />
      </div>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2"><Bot size={14} className="text-primary" /><h2 className="text-sm font-semibold text-foreground">學習器健康狀態</h2></div>
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="rounded-md bg-background p-3">啟動時間：{state?.startedAt ? new Date(state.startedAt).toLocaleString("zh-TW") : "尚未啟動"}</div>
          <div className="rounded-md bg-background p-3">最後掃描：{state?.lastCycleAt ? new Date(state.lastCycleAt).toLocaleString("zh-TW") : "尚未執行"}</div>
          <div className="rounded-md bg-background p-3">最後評估：{evolution?.lastEvaluationAt ? new Date(evolution.lastEvaluationAt).toLocaleString("zh-TW") : "尚未評估"}</div>
          <div className="rounded-md bg-background p-3">建議門檻：分數至少改善 +{evolution?.minImprovement ?? 0}</div>
        </div>
        <div className="rounded-md bg-background p-3 text-xs font-mono text-muted-foreground">{message}</div>
        {state?.lastError && <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"><AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />{state.lastError}</div>}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2"><BarChart3 size={14} className="text-primary" /><h2 className="text-sm font-semibold text-foreground">候選參數組比較</h2></div>
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
                      {active && <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">參考組</span>}
                      {recommended && <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">建議採用</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{profile.description}</p>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">評分 {profile.metrics.score.toFixed(2)}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono sm:grid-cols-4 lg:grid-cols-7">
                  <span className="text-muted-foreground">交易 {profile.metrics.trades}</span>
                  <span className="text-muted-foreground">獲利 {profile.metrics.wins}</span>
                  <span className="text-muted-foreground">虧損 {profile.metrics.losses}</span>
                  <span className={metricTone(profile.metrics.winRate)}>勝率 {pct(profile.metrics.winRate)}</span>
                  <span className={metricTone(profile.metrics.averagePnlPct)}>平均盈虧 {pct(profile.metrics.averagePnlPct)}</span>
                  <span className={metricTone(profile.metrics.profitFactor - 1)}>獲利因子 {profile.metrics.profitFactor.toFixed(2)}</span>
                  <span className={profile.metrics.maxDrawdownPct > 0 ? "text-amber-400" : "text-muted-foreground"}>最大回撤 {pct(profile.metrics.maxDrawdownPct)}</span>
                </div>
                <div className="mt-2 text-xs font-mono text-muted-foreground">進場門檻偏移 {profile.entryScoreOffset} · 風險倍率 {profile.riskScale.toFixed(2)} · 最大槓桿 {profile.maxLeverage}x</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">目前參考參數</h2>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono text-muted-foreground sm:grid-cols-5">
          <div className="rounded-md bg-background p-3">做多門檻 ≥ {evolution?.runtimeParameters.longScore ?? "-"}</div>
          <div className="rounded-md bg-background p-3">做空門檻 ≤ {evolution?.runtimeParameters.shortScore ?? "-"}</div>
          <div className="rounded-md bg-background p-3">基準倉位 {evolution?.runtimeParameters.basePositionUsdt ?? "-"} USDT</div>
          <div className="rounded-md bg-background p-3">單筆上限 {evolution?.runtimeParameters.maxSingleUsdt ?? "-"} USDT</div>
          <div className="rounded-md bg-background p-3">槓桿上限 {evolution?.runtimeParameters.maxLeverage ?? "-"}x</div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">最近學習日誌</h2>
        {!state?.logs.length ? <p className="text-xs text-muted-foreground">目前尚無日誌。</p> : state.logs.slice(0, 20).map((item, index) => (
          <div key={`${item.time}-${index}`} className="rounded-md border border-border/50 bg-background p-3 text-xs">
            <div className="flex items-center gap-2">
              {item.level === "info" ? <CheckCircle2 size={13} className="text-emerald-400" /> : <AlertTriangle size={13} className={item.level === "warn" ? "text-amber-400" : "text-red-400"} />}
              <span className="font-mono text-muted-foreground">{new Date(item.time).toLocaleString("zh-TW")}</span>
            </div>
            <p className="mt-1 text-foreground">{item.message}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
