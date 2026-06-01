import { useState } from "react";
import { Link } from "wouter";
import {
  useListStrategies, useDeleteStrategy, useUpdateStrategy, getListStrategiesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Edit2, Trash2, Play, Pause, BarChart2, TrendingUp, Grid, Activity } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  ma_crossover: "均線交叉",
  rsi: "RSI 指標",
  bollinger: "布林通道",
  grid: "網格交易",
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  ma_crossover: TrendingUp,
  rsi: Activity,
  bollinger: BarChart2,
  grid: Grid,
};

const TYPE_COLORS: Record<string, string> = {
  ma_crossover: "text-primary bg-primary/10 border-primary/30",
  rsi: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  bollinger: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  grid: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};

const DEMO_STRATEGIES = [
  { id: 1, name: "BTC 均線交叉策略", type: "ma_crossover", symbol: "BTC/USDT", interval: "4h", isActive: true, description: "使用短期與長期均線交叉信號進行 BTC 交易", params: { shortPeriod: 9, longPeriod: 21, signalPeriod: 9 }, createdAt: new Date(Date.now() - 86400000 * 7).toISOString() },
  { id: 2, name: "ETH RSI 超買超賣", type: "rsi", symbol: "ETH/USDT", interval: "1h", isActive: true, description: "利用 RSI 指標捕捉 ETH 超買超賣反轉機會", params: { period: 14, overbought: 70, oversold: 30 }, createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
  { id: 3, name: "SOL 布林通道突破", type: "bollinger", symbol: "SOL/USDT", interval: "1h", isActive: false, description: "SOL 布林通道突破策略", params: { period: 20, stdDev: 2.0 }, createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
  { id: 4, name: "BTC-USDT 網格交易", type: "grid", symbol: "BTC/USDT", interval: "15m", isActive: true, description: "在 60,000–72,000 USD 區間設置 20 格網格自動買低賣高", params: { upperPrice: 72000, lowerPrice: 60000, gridCount: 20 }, createdAt: new Date(Date.now() - 86400000 * 1).toISOString() },
];

export default function Strategies() {
  const { data: strategies, isLoading } = useListStrategies();
  const deleteStrategy = useDeleteStrategy();
  const updateStrategy = useUpdateStrategy();
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<number | null>(null);

  const list = (strategies && strategies.length > 0) ? strategies : DEMO_STRATEGIES;

  const handleDelete = async (id: number) => {
    if (!confirm("確定要刪除此策略？")) return;
    setDeleting(id);
    try {
      await deleteStrategy.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListStrategiesQueryKey() });
    } catch { } finally { setDeleting(null); }
  };

  const handleToggle = async (id: number, current: boolean) => {
    try {
      await updateStrategy.mutateAsync({ id, data: { isActive: !current } });
      qc.invalidateQueries({ queryKey: getListStrategiesQueryKey() });
    } catch { }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">策略管理</h1>
          <p className="text-xs text-muted-foreground mt-0.5">建立與管理量化交易策略</p>
        </div>
        <Link href="/strategies/new">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            data-testid="button-new-strategy"
          >
            <Plus size={14} />
            建立策略
          </button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((s) => {
            const Icon = TYPE_ICONS[s.type] ?? BarChart2;
            const colorClass = TYPE_COLORS[s.type] ?? "text-primary bg-primary/10 border-primary/30";
            return (
              <div key={s.id} className="bg-card border border-border rounded-lg p-4 hover:border-border/80 transition-colors" data-testid={`card-strategy-${s.id}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-md border ${colorClass}`}>
                      <Icon size={14} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{s.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${colorClass}`}>{TYPE_LABELS[s.type]}</span>
                        <span className="text-xs text-muted-foreground">{s.symbol}</span>
                        <span className="text-xs text-muted-foreground">{s.interval}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.isActive ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-muted text-muted-foreground border border-border"}`}>
                      {s.isActive ? "執行中" : "已停用"}
                    </div>
                  </div>
                </div>

                {s.description && (
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{s.description}</p>
                )}

                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/40">
                  <button
                    onClick={() => handleToggle(s.id, s.isActive)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-border hover:bg-accent transition-colors"
                    data-testid={`button-toggle-${s.id}`}
                  >
                    {s.isActive ? <Pause size={11} /> : <Play size={11} />}
                    {s.isActive ? "暫停" : "啟動"}
                  </button>
                  <Link href={`/backtests?strategy=${s.id}`}>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-border hover:bg-accent transition-colors" data-testid={`button-backtest-${s.id}`}>
                      <BarChart2 size={11} />
                      回測
                    </button>
                  </Link>
                  <div className="flex-1" />
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={deleting === s.id}
                    className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    data-testid={`button-delete-${s.id}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && list.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Layers size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">尚無策略，點擊「建立策略」開始</p>
        </div>
      )}
    </div>
  );
}

function Layers({ size, className }: { size: number; className?: string }) {
  return <BarChart2 size={size} className={className} />;
}
