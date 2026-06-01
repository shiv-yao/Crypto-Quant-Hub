import { useState } from "react";
import {
  useListPositions, useListOrders, useGetPaperTradingSummary, useToggleStrategyExecution,
  getListPositionsQueryKey, getGetPaperTradingSummaryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Pause, ArrowUpRight, ArrowDownRight, Activity, DollarSign, TrendingUp, TrendingDown } from "lucide-react";

const DEMO_POSITIONS = [
  { id: 1, symbol: "BTC/USDT", side: "long" as const, size: 0.05, entryPrice: 65200, currentPrice: 67342, unrealizedPnl: 107.1, unrealizedPnlPct: 3.28, strategyName: "BTC 均線交叉策略", openedAt: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 2, symbol: "SOL/USDT", side: "long" as const, size: 2.5, entryPrice: 175.3, currentPrice: 182.45, unrealizedPnl: 17.875, unrealizedPnlPct: 4.08, strategyName: "SOL 布林通道突破", openedAt: new Date(Date.now() - 86400000).toISOString() },
];

const DEMO_ORDERS = [
  { id: 1, symbol: "BTC/USDT", side: "buy" as const, type: "market" as const, size: 0.05, price: 65200, status: "filled" as const, strategyName: "BTC 均線交叉策略", createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 2, symbol: "ETH/USDT", side: "sell" as const, type: "limit" as const, size: 0.5, price: 3600, status: "cancelled" as const, strategyName: "ETH RSI 超買超賣", createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 3, symbol: "SOL/USDT", side: "buy" as const, type: "market" as const, size: 2.5, price: 175.3, status: "filled" as const, strategyName: "SOL 布林通道突破", createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 4, symbol: "BTC/USDT", side: "buy" as const, type: "limit" as const, size: 0.02, price: 66500, status: "pending" as const, strategyName: "BTC-USDT 網格交易", createdAt: new Date(Date.now() - 3600000).toISOString() },
];

const DEMO_SUMMARY = { totalEquity: 10497.5, availableBalance: 6372.5, totalUnrealizedPnl: 124.975, totalRealizedPnl: 372.5, totalTrades: 47, winRate: 62.5, activeStrategies: 3 };

const STATUS_COLORS: Record<string, string> = {
  filled: "bg-emerald-500/15 text-emerald-400",
  pending: "bg-amber-500/15 text-amber-400",
  cancelled: "bg-muted text-muted-foreground",
  rejected: "bg-red-500/15 text-red-400",
};
const STATUS_LABELS: Record<string, string> = { filled: "成交", pending: "掛單中", cancelled: "已取消", rejected: "已拒絕" };
const SIDE_LABELS: Record<string, string> = { buy: "買入", sell: "賣出" };
const TYPE_LABELS: Record<string, string> = { market: "市價", limit: "限價", stop: "止損" };

const RUNNING_STRATEGIES = [
  { id: 1, name: "BTC 均線交叉策略", symbol: "BTC/USDT", isRunning: true },
  { id: 2, name: "ETH RSI 超買超賣", symbol: "ETH/USDT", isRunning: false },
  { id: 3, name: "BTC-USDT 網格交易", symbol: "BTC/USDT", isRunning: true },
];

export default function PaperTrading() {
  const { data: positions } = useListPositions();
  const { data: orders } = useListOrders();
  const { data: summary } = useGetPaperTradingSummary();
  const toggleExec = useToggleStrategyExecution();
  const qc = useQueryClient();

  const [runningStrategies, setRunningStrategies] = useState(RUNNING_STRATEGIES);

  const pos = (positions && positions.length > 0) ? positions : DEMO_POSITIONS;
  const ord = (orders && orders.length > 0) ? orders : DEMO_ORDERS;
  const sum = summary ?? DEMO_SUMMARY;

  const handleToggle = async (stratId: number) => {
    try {
      const result = await toggleExec.mutateAsync({ id: stratId });
      setRunningStrategies(prev => prev.map(s => s.id === stratId ? { ...s, isRunning: result.isRunning } : s));
      qc.invalidateQueries({ queryKey: getListPositionsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetPaperTradingSummaryQueryKey() });
    } catch { }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">模擬交易</h1>
          <p className="text-xs text-muted-foreground mt-0.5">即時策略執行與持倉追蹤（模擬模式）</p>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30">
          <span className="text-xs font-medium text-primary">模擬帳戶</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">帳戶總值</p>
          <p className="text-2xl font-bold font-mono text-foreground">${sum.totalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">可用餘額</p>
          <p className="text-2xl font-bold font-mono text-foreground">${sum.availableBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">未實現損益</p>
          <p className={`text-2xl font-bold font-mono ${sum.totalUnrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {sum.totalUnrealizedPnl >= 0 ? "+" : ""}${sum.totalUnrealizedPnl.toFixed(2)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">已實現損益</p>
          <p className={`text-2xl font-bold font-mono ${sum.totalRealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {sum.totalRealizedPnl >= 0 ? "+" : ""}${sum.totalRealizedPnl.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-foreground mb-4">當前持倉</h2>
            {pos.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">暫無持倉</p>
            ) : (
              <div className="space-y-2">
                {pos.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0" data-testid={`position-${p.id}`}>
                    <div className="flex items-center gap-3">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${p.side === "long" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                        {p.side === "long" ? "多" : "空"}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{p.symbol}</p>
                        <p className="text-xs text-muted-foreground">{p.strategyName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <p className="text-xs text-muted-foreground">數量</p>
                        <p className="text-xs font-mono text-foreground">{p.size}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">成本價</p>
                        <p className="text-xs font-mono text-foreground">${p.entryPrice.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">現價</p>
                        <p className="text-xs font-mono text-foreground">${p.currentPrice.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">未實現損益</p>
                        <p className={`text-xs font-mono font-semibold ${p.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {p.unrealizedPnl >= 0 ? "+" : ""}${p.unrealizedPnl.toFixed(2)} ({p.unrealizedPnlPct >= 0 ? "+" : ""}{p.unrealizedPnlPct.toFixed(2)}%)
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-foreground mb-4">下單紀錄</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">交易對</th>
                    <th className="text-left py-2 px-2 font-medium">方向</th>
                    <th className="text-left py-2 px-2 font-medium">類型</th>
                    <th className="text-right py-2 px-2 font-medium">數量</th>
                    <th className="text-right py-2 px-2 font-medium">價格</th>
                    <th className="text-left py-2 px-2 font-medium">策略</th>
                    <th className="text-left py-2 px-2 font-medium">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {ord.map(o => (
                    <tr key={o.id} className="border-b border-border/30" data-testid={`order-${o.id}`}>
                      <td className="py-2 px-2 font-semibold text-foreground">{o.symbol}</td>
                      <td className="py-2 px-2">
                        <span className={o.side === "buy" ? "text-emerald-400" : "text-red-400"}>{SIDE_LABELS[o.side]}</span>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{TYPE_LABELS[o.type]}</td>
                      <td className="py-2 px-2 text-right font-mono text-foreground">{o.size}</td>
                      <td className="py-2 px-2 text-right font-mono text-foreground">${o.price.toLocaleString()}</td>
                      <td className="py-2 px-2 text-muted-foreground max-w-[120px] truncate">{o.strategyName}</td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[o.status]}`}>{STATUS_LABELS[o.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">策略控制</h2>
          <div className="space-y-3">
            {runningStrategies.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 border border-border rounded-lg" data-testid={`strategy-control-${s.id}`}>
                <div>
                  <p className="text-xs font-semibold text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.symbol}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${s.isRunning ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
                  <button
                    onClick={() => handleToggle(s.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
                      s.isRunning
                        ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                        : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                    }`}
                    data-testid={`button-toggle-exec-${s.id}`}
                  >
                    {s.isRunning ? <Pause size={10} /> : <Play size={10} />}
                    {s.isRunning ? "暫停" : "啟動"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">模擬勝率</span>
              <span className="font-mono text-foreground">{sum.winRate.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">總交易筆數</span>
              <span className="font-mono text-foreground">{sum.totalTrades}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">執行中策略</span>
              <span className="font-mono text-foreground">{runningStrategies.filter(s => s.isRunning).length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
