import { useState } from "react";
import { Link } from "wouter";
import {
  useListBacktests, useRunBacktest, useListStrategies, getListBacktestsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Play, TrendingUp, TrendingDown, BarChart2, ChevronRight } from "lucide-react";

const DEMO_BACKTESTS = [
  { id: 1, strategyId: 1, strategyName: "BTC 均線交叉策略", symbol: "BTC/USDT", interval: "4h", startDate: "2024-01-01", endDate: "2024-06-30", initialCapital: 10000, finalCapital: 13240, totalReturn: 32.4, annualizedReturn: 75.2, maxDrawdown: 12.8, winRate: 58.3, profitFactor: 1.87, totalTrades: 67, status: "completed" as const, createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), equityCurve: null, trades: null },
  { id: 2, strategyId: 2, strategyName: "ETH RSI 超買超賣", symbol: "ETH/USDT", interval: "1h", startDate: "2024-03-01", endDate: "2024-06-30", initialCapital: 5000, finalCapital: 5745, totalReturn: 14.9, annualizedReturn: 52.1, maxDrawdown: 8.3, winRate: 61.2, profitFactor: 1.54, totalTrades: 94, status: "completed" as const, createdAt: new Date(Date.now() - 86400000 * 1).toISOString(), equityCurve: null, trades: null },
];

const DEMO_STRATEGIES = [
  { id: 1, name: "BTC 均線交叉策略", type: "ma_crossover", symbol: "BTC/USDT", interval: "4h", isActive: true, description: "", params: {}, createdAt: "" },
  { id: 2, name: "ETH RSI 超買超賣", type: "rsi", symbol: "ETH/USDT", interval: "1h", isActive: true, description: "", params: {}, createdAt: "" },
  { id: 3, name: "SOL 布林通道突破", type: "bollinger", symbol: "SOL/USDT", interval: "1h", isActive: false, description: "", params: {}, createdAt: "" },
  { id: 4, name: "BTC-USDT 網格交易", type: "grid", symbol: "BTC/USDT", interval: "15m", isActive: true, description: "", params: {}, createdAt: "" },
];

export default function Backtests() {
  const { data: backtests, isLoading } = useListBacktests();
  const { data: strategies } = useListStrategies();
  const runBacktest = useRunBacktest();
  const qc = useQueryClient();

  const [strategyId, setStrategyId] = useState<string>("");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2024-06-30");
  const [capital, setCapital] = useState("10000");
  const [running, setRunning] = useState(false);

  const strategyList = (strategies && strategies.length > 0) ? strategies : DEMO_STRATEGIES;
  const list = (backtests && backtests.length > 0) ? backtests : DEMO_BACKTESTS;

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strategyId) return;
    setRunning(true);
    try {
      await runBacktest.mutateAsync({ data: { strategyId: Number(strategyId), startDate, endDate, initialCapital: Number(capital) } });
      qc.invalidateQueries({ queryKey: getListBacktestsQueryKey() });
    } catch { } finally { setRunning(false); }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">回測</h1>
        <p className="text-xs text-muted-foreground mt-0.5">使用歷史資料測試策略表現</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">執行新回測</h2>
        <form onSubmit={handleRun} className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">選擇策略</label>
            <select value={strategyId} onChange={e => setStrategyId(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              data-testid="select-backtest-strategy">
              <option value="">請選擇策略</option>
              {strategyList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">開始日期</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              data-testid="input-start-date" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">結束日期</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              data-testid="input-end-date" />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1">初始資金 (USDT)</label>
              <input type="number" value={capital} onChange={e => setCapital(e.target.value)}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                data-testid="input-capital" />
            </div>
            <button type="submit" disabled={!strategyId || running}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              data-testid="button-run-backtest">
              <Play size={12} />
              {running ? "執行中..." : "執行"}
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">回測記錄</h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="bg-card border border-border rounded-lg h-20 animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {list.map(bt => (
              <Link key={bt.id} href={`/backtests/${bt.id}`}>
                <div className="bg-card border border-border rounded-lg p-4 hover:border-border/80 cursor-pointer transition-colors" data-testid={`card-backtest-${bt.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-md bg-primary/10">
                        <BarChart2 size={14} className="text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{bt.strategyName}</p>
                        <p className="text-xs text-muted-foreground">{bt.symbol} · {bt.interval} · {bt.startDate} ~ {bt.endDate}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">總報酬</p>
                        <p className={`text-sm font-mono font-bold ${bt.totalReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {bt.totalReturn >= 0 ? "+" : ""}{bt.totalReturn.toFixed(2)}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">最大回撤</p>
                        <p className="text-sm font-mono text-red-400">-{bt.maxDrawdown.toFixed(2)}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">勝率</p>
                        <p className="text-sm font-mono text-foreground">{bt.winRate.toFixed(1)}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">交易次數</p>
                        <p className="text-sm font-mono text-foreground">{bt.totalTrades}</p>
                      </div>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
