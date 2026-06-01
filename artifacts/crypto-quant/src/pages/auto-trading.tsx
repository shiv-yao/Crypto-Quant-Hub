import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Play, RefreshCw, RotateCw, ShieldCheck, Square, Zap } from "lucide-react";

interface AutoTradingState {
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
  strategyCount: number;
  activeStrategyCount: number;
  positionCount: number;
  tradeCount: number;
  orderCount: number;
  intervalMs: number;
  brokerSyncEnabled: boolean;
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

export default function AutoTrading() {
  const [state, setState] = useState<AutoTradingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("讀取中...");

  async function load() {
    setLoading(true);
    try {
      const data = await api<AutoTradingState>("/api/auto-trading/status");
      setState(data);
      setMessage(data.enabled ? "OKX Demo 自動交易引擎已啟動" : "自動交易引擎目前停止");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "讀取狀態失敗");
    } finally {
      setLoading(false);
    }
  }

  async function action(path: string, success: string) {
    setLoading(true);
    try {
      await api(`/api/auto-trading/${path}`, { method: "POST" });
      setMessage(success);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗");
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
          <h1 className="text-xl font-bold text-foreground">OKX Demo 自動交易</h1>
          <p className="mt-1 text-xs text-muted-foreground">OKX 主網真實行情 · 自動策略掃描 · 系統內部模擬持倉 · 可選 Demo Broker 同步</p>
        </div>
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${state?.enabled ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-amber-500/40 bg-amber-500/10 text-amber-400"}`}>
          <span className={`h-2 w-2 rounded-full ${state?.enabled ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
          {state?.enabled ? "引擎執行中" : "引擎已停止"}
        </div>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-xs text-muted-foreground leading-relaxed">
        <div className="flex items-start gap-2">
          <ShieldCheck size={15} className="mt-0.5 flex-shrink-0 text-primary" />
          <span>目前為 OKX Demo 安全模式。策略會使用 OKX 真實公開行情自動建立模擬持倉、停損停利與交易紀錄。只有 Railway 設定 <code className="text-primary">AUTO_OKX_DEMO_ORDERS=true</code> 時，才會同步送出 OKX Demo 訂單；主網真實資金不會被使用。</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="策略數量" value={state?.strategyCount ?? 0} sub={`${state?.activeStrategyCount ?? 0} 個啟用中`} />
        <Stat label="目前持倉" value={state?.positionCount ?? 0} sub="自動監控停損停利" />
        <Stat label="掃描輪次" value={state?.cycleCount ?? 0} sub={`每 ${Math.round((state?.intervalMs ?? 30000) / 1000)} 秒`} />
        <Stat label="訊號數量" value={state?.signalCount ?? 0} sub="符合進場門檻" />
        <Stat label="已建立持倉" value={state?.openedPositions ?? 0} />
        <Stat label="已完成平倉" value={state?.closedPositions ?? 0} />
        <Stat label="交易紀錄" value={state?.tradeCount ?? 0} />
        <Stat label="OKX Demo 同步單" value={state?.demoBrokerOrders ?? 0} sub={state?.brokerSyncEnabled ? "同步已開啟" : "預設關閉"} />
      </div>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">控制中心</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <button disabled={loading} onClick={() => void action("start", "已啟動 OKX Demo 自動交易引擎")} className="flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            <Play size={13} /> 開始自動交易
          </button>
          <button disabled={loading} onClick={() => void action("stop", "已停止自動交易引擎")} className="flex items-center justify-center gap-2 rounded-md bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            <Square size={13} /> 停止引擎
          </button>
          <button disabled={loading} onClick={() => void action("run-once", "已完成一輪策略掃描")} className="flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50">
            <Zap size={13} /> 立即掃描一輪
          </button>
          <button disabled={loading} onClick={() => void load()} className="flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50">
            <RefreshCw size={13} /> 重新整理
          </button>
        </div>
        <div className="rounded-md bg-background p-3 text-xs font-mono text-muted-foreground break-words">{message}</div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">執行狀態</h2>
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="rounded-md bg-background p-3">啟動時間：{state?.startedAt ? new Date(state.startedAt).toLocaleString("zh-TW") : "尚未啟動"}</div>
          <div className="rounded-md bg-background p-3">最後掃描：{state?.lastCycleAt ? new Date(state.lastCycleAt).toLocaleString("zh-TW") : "尚未執行"}</div>
        </div>
        {state?.lastError && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{state.lastError}</span>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <RotateCw size={14} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">最近引擎日誌</h2>
        </div>
        {!state?.logs.length ? (
          <p className="text-xs text-muted-foreground">尚無日誌。</p>
        ) : (
          <div className="space-y-2">
            {state.logs.map((item, index) => (
              <div key={`${item.time}-${index}`} className="rounded-md border border-border/50 bg-background p-3 text-xs">
                <div className="flex items-center gap-2">
                  {item.level === "info" ? <CheckCircle2 size={13} className="text-emerald-400" /> : item.level === "warn" ? <AlertTriangle size={13} className="text-amber-400" /> : <AlertTriangle size={13} className="text-red-400" />}
                  <span className="font-mono text-muted-foreground">{new Date(item.time).toLocaleString("zh-TW")}</span>
                </div>
                <p className="mt-1 text-foreground">{item.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 leading-relaxed">
        <Activity size={14} className="mt-0.5 flex-shrink-0" />
        <span>自動策略只用於研究與模擬，不代表保證獲利。建議先觀察持倉、PnL 與引擎日誌，再評估是否開啟 OKX Demo Broker 同步。</span>
      </div>
    </div>
  );
}
