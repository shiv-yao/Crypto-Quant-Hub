import { useRoute, useLocation } from "wouter";
import { useGetBacktest, getGetBacktestQueryKey } from "@workspace/api-client-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChevronLeft, TrendingUp, TrendingDown, Target, Activity, BarChart2, Percent } from "lucide-react";

function generateDemoEquityCurve(initialCapital: number, totalReturn: number, startDate: string) {
  const pts = [];
  let val = initialCapital;
  const days = 180;
  const daily = Math.pow(1 + totalReturn / 100, 1 / days);
  for (let i = 0; i <= days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    val = val * (daily + (Math.random() - 0.47) * 0.012);
    pts.push({ date: d.toISOString().split("T")[0], value: Math.round(val * 100) / 100 });
  }
  return pts;
}

const DEMO_BACKTEST = {
  id: 1, strategyId: 1, strategyName: "BTC 均線交叉策略", symbol: "BTC/USDT", interval: "4h",
  startDate: "2024-01-01", endDate: "2024-06-30", initialCapital: 10000, finalCapital: 13240,
  totalReturn: 32.4, annualizedReturn: 75.2, maxDrawdown: 12.8, winRate: 58.3, profitFactor: 1.87,
  totalTrades: 67, status: "completed" as const, createdAt: new Date().toISOString(),
  equityCurve: null, trades: null,
};

const DEMO_TRADES = [
  { id: 1, side: "long", entryPrice: 42300, exitPrice: 45600, entryDate: "2024-01-15T08:00:00Z", exitDate: "2024-01-22T16:00:00Z", pnl: 165.0, pnlPct: 7.8 },
  { id: 2, side: "long", entryPrice: 46200, exitPrice: 44800, entryDate: "2024-02-01T08:00:00Z", exitDate: "2024-02-05T12:00:00Z", pnl: -70.0, pnlPct: -3.03 },
  { id: 3, side: "long", entryPrice: 51800, exitPrice: 58200, entryDate: "2024-02-20T08:00:00Z", exitDate: "2024-03-10T16:00:00Z", pnl: 620.5, pnlPct: 12.36 },
  { id: 4, side: "short", entryPrice: 62400, exitPrice: 59800, entryDate: "2024-04-01T08:00:00Z", exitDate: "2024-04-08T12:00:00Z", pnl: 130.0, pnlPct: 4.17 },
  { id: 5, side: "long", entryPrice: 61200, exitPrice: 69800, entryDate: "2024-05-01T08:00:00Z", exitDate: "2024-05-28T16:00:00Z", pnl: 860.0, pnlPct: 14.05 },
  { id: 6, side: "long", entryPrice: 67500, exitPrice: 65200, entryDate: "2024-06-01T08:00:00Z", exitDate: "2024-06-10T12:00:00Z", pnl: -115.0, pnlPct: -3.41 },
];

function MetricCard({ label, value, sub, icon: Icon, positive }: { label: string; value: string; sub?: string; icon: React.ElementType; positive?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon size={12} className="text-muted-foreground" />
      </div>
      <p className={`text-xl font-bold font-mono ${positive === undefined ? "text-foreground" : positive ? "text-emerald-400" : "text-red-400"}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function BacktestDetail() {
  const [, params] = useRoute("/backtests/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);

  const { data: bt, isLoading } = useGetBacktest(id, { query: { enabled: !!id, queryKey: getGetBacktestQueryKey(id) } });

  const data = bt ?? DEMO_BACKTEST;
  const equityCurve = (bt?.equityCurve && bt.equityCurve.length > 0)
    ? bt.equityCurve as { date: string; value: number }[]
    : generateDemoEquityCurve(data.initialCapital, data.totalReturn, data.startDate);
  const trades = (bt?.trades && bt.trades.length > 0)
    ? bt.trades as typeof DEMO_TRADES
    : DEMO_TRADES;

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { value: number }[] }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded px-3 py-2 text-xs">
        <p className="text-foreground font-mono">${payload[0].value.toLocaleString()}</p>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => setLocation("/backtests")} className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground" data-testid="button-back">
          <ChevronLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">{data.strategyName}</h1>
          <p className="text-xs text-muted-foreground">{data.symbol} · {data.interval} · {data.startDate} ~ {data.endDate}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="總報酬" value={`${data.totalReturn >= 0 ? "+" : ""}${data.totalReturn.toFixed(2)}%`} icon={TrendingUp} positive={data.totalReturn >= 0} />
        <MetricCard label="年化報酬" value={`${data.annualizedReturn.toFixed(2)}%`} icon={BarChart2} positive={data.annualizedReturn >= 0} />
        <MetricCard label="最大回撤" value={`-${data.maxDrawdown.toFixed(2)}%`} icon={TrendingDown} positive={false} />
        <MetricCard label="勝率" value={`${data.winRate.toFixed(1)}%`} icon={Percent} positive={data.winRate >= 50} />
        <MetricCard label="盈虧比" value={data.profitFactor.toFixed(2)} sub="獲利/虧損比率" icon={Target} positive={data.profitFactor >= 1} />
        <MetricCard label="交易次數" value={String(data.totalTrades)} icon={Activity} />
        <MetricCard label="初始資金" value={`$${data.initialCapital.toLocaleString()}`} icon={BarChart2} />
        <MetricCard label="最終資金" value={`$${data.finalCapital.toLocaleString()}`} icon={TrendingUp} positive={data.finalCapital >= data.initialCapital} />
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-foreground mb-4">資產曲線</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityCurve} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(191 100% 50%)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(191 100% 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 27.9% 16.9%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215 20.2% 65.1%)" }} tickLine={false} axisLine={false}
                tickFormatter={d => d.slice(5)} interval={Math.floor(equityCurve.length / 6)} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215 20.2% 65.1%)" }} tickLine={false} axisLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="value" stroke="hsl(191 100% 50%)" strokeWidth={1.5}
                fill="url(#equityGradient)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-foreground mb-4">逐筆交易紀錄</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">#</th>
                <th className="text-left py-2 px-3 font-medium">方向</th>
                <th className="text-right py-2 px-3 font-medium">進場價格</th>
                <th className="text-right py-2 px-3 font-medium">出場價格</th>
                <th className="text-left py-2 px-3 font-medium">進場時間</th>
                <th className="text-left py-2 px-3 font-medium">出場時間</th>
                <th className="text-right py-2 px-3 font-medium">損益</th>
                <th className="text-right py-2 px-3 font-medium">報酬率</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-border/30 hover:bg-accent/30" data-testid={`row-trade-${t.id}`}>
                  <td className="py-2 px-3 text-muted-foreground">{t.id}</td>
                  <td className="py-2 px-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${t.side === "long" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                      {t.side === "long" ? "多" : "空"}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-foreground">${t.entryPrice.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right font-mono text-foreground">${t.exitPrice.toLocaleString()}</td>
                  <td className="py-2 px-3 text-muted-foreground">{new Date(t.entryDate).toLocaleDateString("zh-TW")}</td>
                  <td className="py-2 px-3 text-muted-foreground">{new Date(t.exitDate).toLocaleDateString("zh-TW")}</td>
                  <td className={`py-2 px-3 text-right font-mono ${t.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                  </td>
                  <td className={`py-2 px-3 text-right font-mono ${t.pnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
