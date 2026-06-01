import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Bot, CheckCircle2, Gauge, Layers, Play, RefreshCw, ShieldCheck, Square, Zap } from "lucide-react";

type SkillStatus = "enabled" | "disabled";
type SignalAction = "LONG" | "SHORT" | "HOLD";

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  status: SkillStatus;
  version: string;
}

interface Signal {
  instId: string;
  action: SignalAction;
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

interface Position {
  id: string;
  instId: string;
  side: "LONG" | "SHORT";
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
  universeCount: number;
  scannedCount: number;
  signalCount: number;
  openedCount: number;
  closedCount: number;
  brokerOrderCount: number;
  realizedPnlPct: number;
  brokerSyncEnabled: boolean;
  intervalMs: number;
  positions: Position[];
  latestSignals: Signal[];
  skills: Skill[];
  logs: Array<{ time: string; level: "info" | "warn" | "error"; message: string }>;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({ error: "回傳格式不是 JSON" }));
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

function badge(action: SignalAction) {
  if (action === "LONG") return "bg-emerald-500/10 border-emerald-500/40 text-emerald-400";
  if (action === "SHORT") return "bg-red-500/10 border-red-500/40 text-red-400";
  return "bg-slate-500/10 border-slate-500/40 text-slate-400";
}

export default function OkxSwapAi() {
  const [state, setState] = useState<SwapAiState | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("讀取中...");

  async function load() {
    setLoading(true);
    try {
      const data = await api<SwapAiState>("/api/okx-swap-ai/status");
      setState(data);
      setMessage(data.enabled ? "OKX 合約 AI Demo 引擎執行中" : "OKX 合約 AI Demo 引擎目前停止");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "讀取狀態失敗");
    } finally {
      setLoading(false);
    }
  }

  async function action(path: string, success: string) {
    setLoading(true);
    try {
      await api(`/api/okx-swap-ai/${path}`, { method: "POST" });
      setMessage(success);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗");
    } finally {
      setLoading(false);
    }
  }

  async function toggleSkill(skill: Skill) {
    setLoading(true);
    try {
      await api(`/api/okx-swap-ai/skills/${encodeURIComponent(skill.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: skill.status === "enabled" ? "disabled" : "enabled" }),
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新 Skill 失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">OKX 全幣種合約 AI</h1>
          <p className="mt-1 text-xs text-muted-foreground">USDT 永續合約 · AI 多因子訊號 · LONG／SHORT · Demo Trading Skills</p>
        </div>
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${state?.enabled ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-amber-500/40 bg-amber-500/10 text-amber-400"}`}>
          <span className={`h-2 w-2 rounded-full ${state?.enabled ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
          {state?.enabled ? "AI 引擎執行中" : "AI 引擎已停止"}
        </div>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-xs text-muted-foreground leading-relaxed">
        <div className="flex items-start gap-2">
          <ShieldCheck size={15} className="mt-0.5 flex-shrink-0 text-primary" />
          <span>目前只允許 OKX Demo 合約。AI 會掃描 OKX 上線中的 USDT 永續合約，依 EMA、RSI、ATR、動能與量能判斷 LONG、SHORT 或 HOLD。主網實盤仍硬性關閉。</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="USDT 合約幣種" value={state?.universeCount ?? 0} sub="動態探索" />
        <Stat label="累積掃描" value={state?.scannedCount ?? 0} sub={`每 ${Math.round((state?.intervalMs ?? 45000) / 1000)} 秒`} />
        <Stat label="AI 訊號" value={state?.signalCount ?? 0} sub="LONG 或 SHORT" />
        <Stat label="目前持倉" value={state?.positions.length ?? 0} sub="最大值由風控限制" />
        <Stat label="建立持倉" value={state?.openedCount ?? 0} />
        <Stat label="完成平倉" value={state?.closedCount ?? 0} />
        <Stat label="Demo 同步單" value={state?.brokerOrderCount ?? 0} sub={state?.brokerSyncEnabled ? "已同步 OKX Demo" : "僅系統內模擬"} />
        <Stat label="累積已實現 PnL" value={`${(state?.realizedPnlPct ?? 0).toFixed(2)}%`} />
      </div>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">控制中心</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <button disabled={loading} onClick={() => void action("start", "已啟動 OKX 合約 AI Demo 引擎")} className="flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Play size={13} /> 啟動引擎</button>
          <button disabled={loading} onClick={() => void action("stop", "已停止 OKX 合約 AI Demo 引擎")} className="flex items-center justify-center gap-2 rounded-md bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Square size={13} /> 停止引擎</button>
          <button disabled={loading} onClick={() => void action("run-once", "已完成一輪全幣種分批掃描")} className="flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50"><Zap size={13} /> 立即掃描</button>
          <button disabled={loading} onClick={() => void load()} className="flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50"><RefreshCw size={13} /> 重新整理</button>
        </div>
        <div className="rounded-md bg-background p-3 text-xs font-mono text-muted-foreground break-words">{message}</div>
        {state?.lastError && <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"><AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />{state.lastError}</div>}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2"><Layers size={14} className="text-primary" /><h2 className="text-sm font-semibold text-foreground">OKX Skills</h2></div>
        <div className="space-y-2">
          {(state?.skills ?? []).map((skill) => (
            <div key={skill.id} className="rounded-md border border-border/60 bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">{skill.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{skill.description}</p>
                  <p className="mt-1 text-xs font-mono text-muted-foreground">{skill.id} · v{skill.version}</p>
                </div>
                <button disabled={loading} onClick={() => void toggleSkill(skill)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${skill.status === "enabled" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-slate-500/40 bg-slate-500/10 text-slate-400"}`}>{skill.status === "enabled" ? "啟用" : "停用"}</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2"><Gauge size={14} className="text-primary" /><h2 className="text-sm font-semibold text-foreground">AI 訊號</h2></div>
        {!state?.latestSignals.length ? <p className="text-xs text-muted-foreground">尚無訊號，請啟動引擎或立即掃描。</p> : (
          <div className="space-y-2">
            {state.latestSignals.map((signal) => (
              <div key={`${signal.instId}-${signal.generatedAt}`} className="rounded-md border border-border/60 bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-foreground">{signal.instId}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badge(signal.action)}`}>{signal.action} · {signal.score.toFixed(1)}</span>
                </div>
                <p className="mt-2 text-xs font-mono text-muted-foreground">信心 {signal.confidence}% · RSI {signal.rsi} · ATR {signal.atrPct}% · 動能 {signal.momentumPct}% · 量能 {signal.volumeRatio}x</p>
                <p className="mt-2 text-xs text-muted-foreground">{signal.reasons.join(" · ")}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2"><Activity size={14} className="text-primary" /><h2 className="text-sm font-semibold text-foreground">合約持倉</h2></div>
        {!state?.positions.length ? <p className="text-xs text-muted-foreground">目前沒有持倉。</p> : (
          <div className="space-y-2">
            {state.positions.map((position) => (
              <div key={position.id} className="rounded-md border border-border/60 bg-background p-3 text-xs">
                <div className="flex items-center justify-between"><span className="font-semibold text-foreground">{position.instId}</span><span className={position.side === "LONG" ? "text-emerald-400" : "text-red-400"}>{position.side} · {position.leverage}x</span></div>
                <p className="mt-2 font-mono text-muted-foreground">Entry {position.entryPrice} · Now {position.currentPrice} · {position.notionalUsdt} USDT · {position.contracts} 張</p>
                <p className={`mt-1 font-mono ${position.unrealizedPnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>PnL {position.unrealizedPnlPct.toFixed(2)}%</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2"><Bot size={14} className="text-primary" /><h2 className="text-sm font-semibold text-foreground">最近日誌</h2></div>
        {!state?.logs.length ? <p className="text-xs text-muted-foreground">尚無日誌。</p> : state.logs.slice(0, 20).map((item, index) => (
          <div key={`${item.time}-${index}`} className="rounded-md border border-border/50 bg-background p-3 text-xs">
            <div className="flex items-center gap-2">{item.level === "info" ? <CheckCircle2 size={13} className="text-emerald-400" /> : <AlertTriangle size={13} className={item.level === "warn" ? "text-amber-400" : "text-red-400"} />}<span className="font-mono text-muted-foreground">{new Date(item.time).toLocaleString("zh-TW")}</span></div>
            <p className="mt-1 text-foreground">{item.message}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
