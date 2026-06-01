import { useGetDashboardStats, useGetMarketSummary } from "@workspace/api-client-react";
import { TrendingUp, TrendingDown, Activity, BarChart2, Layers, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";

function MarketTicker() {
  const { data: tickers } = useGetMarketSummary();
  const items = tickers ?? [
    { symbol: "BTC/USDT", price: 67342.5, changePct24h: 2.78 },
    { symbol: "ETH/USDT", price: 3521.8, changePct24h: -2.42 },
    { symbol: "SOL/USDT", price: 182.45, changePct24h: 5.38 },
    { symbol: "BNB/USDT", price: 598.2, changePct24h: -2.03 },
    { symbol: "XRP/USDT", price: 0.5843, changePct24h: 4.17 },
    { symbol: "ADA/USDT", price: 0.4521, changePct24h: -2.65 },
  ];

  return (
    <div className="border-b border-border bg-card/50 overflow-hidden">
      <div className="flex animate-marquee whitespace-nowrap">
        {[...items, ...items].map((t, i) => (
          <div key={i} className="inline-flex items-center gap-2 px-6 py-2 border-r border-border/40">
            <span className="text-xs font-mono font-semibold text-foreground">{t.symbol}</span>
            <span className="text-xs font-mono text-foreground">
              {t.price < 1 ? t.price.toFixed(4) : t.price.toLocaleString()}
            </span>
            <span className={`text-xs font-mono flex items-center gap-0.5 ${t.changePct24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {t.changePct24h >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
              {Math.abs(t.changePct24h).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, positive, icon: Icon }: {
  label: string; value: string; sub?: string; positive?: boolean; icon: React.ElementType;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4" data-testid={`stat-card-${label}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
          {sub && (
            <p className={`text-xs mt-1 ${positive === undefined ? "text-muted-foreground" : positive ? "text-emerald-400" : "text-red-400"}`}>
              {sub}
            </p>
          )}
        </div>
        <div className="p-2 rounded-md bg-primary/10">
          <Icon size={16} className="text-primary" />
        </div>
      </div>
    </div>
  );
}

const ACTIVITY_ICONS: Record<string, string> = {
  backtest: "bg-primary/20 text-primary",
  trade: "bg-emerald-500/20 text-emerald-400",
  risk: "bg-red-500/20 text-red-400",
  strategy: "bg-violet-500/20 text-violet-400",
};

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();
  const { data: market } = useGetMarketSummary();

  const demoStats = {
    totalStrategies: 4,
    activeStrategies: 3,
    totalBacktests: 6,
    totalTrades: 47,
    paperTradingPnl: 352.5,
    paperTradingPnlPct: 3.53,
    systemMode: "paper" as const,
    recentActivity: [
      { id: 1, type: "backtest", description: "回測完成：BTC 均線交叉策略，報酬率 +32.4%", timestamp: new Date(Date.now() - 3600000).toISOString() },
      { id: 2, type: "trade", description: "模擬買入 BTC/USDT 0.05 枚 @ 67,342", timestamp: new Date(Date.now() - 7200000).toISOString() },
      { id: 3, type: "risk", description: "風險警示：ETH 持倉接近單日虧損上限", timestamp: new Date(Date.now() - 14400000).toISOString() },
      { id: 4, type: "strategy", description: "策略啟動：SOL 布林通道突破", timestamp: new Date(Date.now() - 21600000).toISOString() },
      { id: 5, type: "backtest", description: "回測完成：ETH RSI 策略，勝率 58.3%", timestamp: new Date(Date.now() - 86400000).toISOString() },
    ],
  };

  const s = stats ?? demoStats;

  const demoMarket = [
    { symbol: "BTC/USDT", price: 67342.5, change24h: 1824.3, changePct24h: 2.78, volume24h: 28450000000, high24h: 68100.0, low24h: 65200.0 },
    { symbol: "ETH/USDT", price: 3521.8, change24h: -87.4, changePct24h: -2.42, volume24h: 12300000000, high24h: 3650.0, low24h: 3480.0 },
    { symbol: "SOL/USDT", price: 182.45, change24h: 9.32, changePct24h: 5.38, volume24h: 3200000000, high24h: 188.0, low24h: 172.0 },
    { symbol: "BNB/USDT", price: 598.2, change24h: -12.4, changePct24h: -2.03, volume24h: 1800000000, high24h: 615.0, low24h: 590.0 },
  ];

  const m = market ?? demoMarket;

  return (
    <div className="flex flex-col">
      <MarketTicker />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">系統儀表板</h1>
            <p className="text-xs text-muted-foreground mt-0.5">加密貨幣量化交易研究平台</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-medium text-primary">模擬模式</span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="策略數量" value={String(s.totalStrategies)} sub={`${s.activeStrategies} 個執行中`} icon={Layers} />
          <StatCard label="回測次數" value={String(s.totalBacktests)} sub="歷史記錄" icon={BarChart2} />
          <StatCard label="模擬交易筆數" value={String(s.totalTrades)} sub="紙上交易" icon={Activity} />
          <StatCard
            label="模擬損益"
            value={`${s.paperTradingPnl >= 0 ? "+" : ""}$${s.paperTradingPnl.toFixed(2)}`}
            sub={`${s.paperTradingPnlPct >= 0 ? "+" : ""}${s.paperTradingPnlPct.toFixed(2)}%`}
            positive={s.paperTradingPnl >= 0}
            icon={s.paperTradingPnl >= 0 ? TrendingUp : TrendingDown}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-foreground mb-4">市場行情</h2>
            <div className="space-y-2">
              {m.map((ticker) => (
                <div key={ticker.symbol} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0" data-testid={`ticker-${ticker.symbol}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
                      {ticker.symbol.split("/")[0][0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{ticker.symbol}</p>
                      <p className="text-xs text-muted-foreground">24h 成交量 ${(ticker.volume24h / 1e9).toFixed(1)}B</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-semibold text-foreground">
                      ${ticker.price < 1 ? ticker.price.toFixed(4) : ticker.price.toLocaleString()}
                    </p>
                    <p className={`text-xs font-mono flex items-center justify-end gap-0.5 ${ticker.changePct24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {ticker.changePct24h >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                      {Math.abs(ticker.changePct24h).toFixed(2)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-foreground mb-4">最新動態</h2>
            <div className="space-y-3">
              {s.recentActivity.map((item) => (
                <div key={item.id} className="flex items-start gap-3" data-testid={`activity-${item.id}`}>
                  <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                    item.type === "backtest" ? "bg-primary" :
                    item.type === "trade" ? "bg-emerald-400" :
                    item.type === "risk" ? "bg-red-400" : "bg-violet-400"
                  }`} />
                  <div>
                    <p className="text-xs text-foreground leading-snug">{item.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(item.timestamp).toLocaleString("zh-TW", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center gap-3">
          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            <span className="font-semibold">免責聲明：</span>
            本系統僅供研究、學習與模擬之用。所有策略與分析結果不構成任何投資建議。加密貨幣市場波動劇烈，請謹慎評估風險。
          </p>
        </div>
      </div>
    </div>
  );
}
