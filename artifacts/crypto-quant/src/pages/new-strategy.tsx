import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateStrategy, getListStrategiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

const STRATEGY_TYPES = [
  { value: "ma_crossover", label: "均線交叉 (MA Crossover)", desc: "利用短長期均線交叉訊號交易" },
  { value: "rsi", label: "RSI 超買超賣", desc: "RSI 進入超買/超賣區間時反向交易" },
  { value: "bollinger", label: "布林通道突破", desc: "價格突破布林帶時進場" },
  { value: "grid", label: "網格交易 (Grid)", desc: "在區間內設置多個買賣格子" },
];

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "AVAX/USDT"];
const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];

function ParamsForm({ type, params, onChange }: { type: string; params: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void }) {
  const set = (key: string, val: number) => onChange({ ...params, [key]: val });

  if (type === "ma_crossover") return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">短期均線週期</label>
        <input type="number" min={5} max={50} defaultValue={9}
          onChange={e => set("shortPeriod", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-shortPeriod" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">長期均線週期</label>
        <input type="number" min={20} max={200} defaultValue={21}
          onChange={e => set("longPeriod", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-longPeriod" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">信號線週期</label>
        <input type="number" min={5} max={20} defaultValue={9}
          onChange={e => set("signalPeriod", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-signalPeriod" />
      </div>
    </div>
  );

  if (type === "rsi") return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">RSI 週期</label>
        <input type="number" min={7} max={30} defaultValue={14}
          onChange={e => set("period", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-period" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">超買門檻</label>
        <input type="number" min={60} max={90} defaultValue={70}
          onChange={e => set("overbought", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-overbought" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">超賣門檻</label>
        <input type="number" min={10} max={40} defaultValue={30}
          onChange={e => set("oversold", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-oversold" />
      </div>
    </div>
  );

  if (type === "bollinger") return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">週期</label>
        <input type="number" min={10} max={50} defaultValue={20}
          onChange={e => set("period", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-period" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">標準差倍數</label>
        <input type="number" min={1} max={3} step={0.1} defaultValue={2.0}
          onChange={e => set("stdDev", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-stdDev" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">帶寬 (%)</label>
        <input type="number" min={1} max={10} step={0.1} defaultValue={2.5}
          onChange={e => set("bandWidth", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-bandWidth" />
      </div>
    </div>
  );

  if (type === "grid") return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">上限價格 (USDT)</label>
        <input type="number" min={0} defaultValue={72000}
          onChange={e => set("upperPrice", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-upperPrice" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">下限價格 (USDT)</label>
        <input type="number" min={0} defaultValue={60000}
          onChange={e => set("lowerPrice", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-lowerPrice" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">格數</label>
        <input type="number" min={5} max={50} defaultValue={20}
          onChange={e => set("gridCount", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-gridCount" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">投入金額 (USDT)</label>
        <input type="number" min={100} defaultValue={5000}
          onChange={e => set("investmentAmount", Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          data-testid="input-investmentAmount" />
      </div>
    </div>
  );

  return null;
}

export default function NewStrategy() {
  const [, setLocation] = useLocation();
  const createStrategy = useCreateStrategy();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [type, setType] = useState("ma_crossover");
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [interval, setInterval] = useState("4h");
  const [description, setDescription] = useState("");
  const [params, setParams] = useState<Record<string, unknown>>({ shortPeriod: 9, longPeriod: 21, signalPeriod: 9 });
  const [error, setError] = useState("");

  const handleTypeChange = (t: string) => {
    setType(t);
    if (t === "ma_crossover") setParams({ shortPeriod: 9, longPeriod: 21, signalPeriod: 9 });
    if (t === "rsi") setParams({ period: 14, overbought: 70, oversold: 30 });
    if (t === "bollinger") setParams({ period: 20, stdDev: 2.0, bandWidth: 2.5 });
    if (t === "grid") setParams({ upperPrice: 72000, lowerPrice: 60000, gridCount: 20, investmentAmount: 5000 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("請輸入策略名稱"); return; }
    setError("");
    try {
      await createStrategy.mutateAsync({ data: { name, type, symbol, interval, params, description } });
      qc.invalidateQueries({ queryKey: getListStrategiesQueryKey() });
      setLocation("/strategies");
    } catch (err) {
      setError("建立策略失敗，請重試");
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setLocation("/strategies")} className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground" data-testid="button-back">
          <ChevronLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">建立策略</h1>
          <p className="text-xs text-muted-foreground mt-0.5">設定新的量化交易策略</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">基本設定</h2>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">策略名稱 *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="例：BTC 均線交叉策略"
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              data-testid="input-strategy-name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">交易對</label>
              <select value={symbol} onChange={e => setSymbol(e.target.value)}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                data-testid="select-symbol">
                {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">時間週期</label>
              <select value={interval} onChange={e => setInterval(e.target.value)}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                data-testid="select-interval">
                {INTERVALS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">描述（選填）</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="簡述此策略的邏輯..."
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
              data-testid="input-description" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">策略類型</h2>
          <div className="grid grid-cols-2 gap-3">
            {STRATEGY_TYPES.map(st => (
              <button key={st.value} type="button" onClick={() => handleTypeChange(st.value)}
                className={`p-3 rounded-lg border text-left transition-all ${type === st.value ? "border-primary bg-primary/10" : "border-border hover:border-border/80"}`}
                data-testid={`button-type-${st.value}`}>
                <p className={`text-xs font-semibold ${type === st.value ? "text-primary" : "text-foreground"}`}>{st.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{st.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">策略參數</h2>
          <ParamsForm type={type} params={params} onChange={setParams} />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={() => setLocation("/strategies")}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
            data-testid="button-cancel">
            取消
          </button>
          <button type="submit" disabled={createStrategy.isPending}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            data-testid="button-submit-strategy">
            {createStrategy.isPending ? "建立中..." : "建立策略"}
          </button>
        </div>
      </form>
    </div>
  );
}
