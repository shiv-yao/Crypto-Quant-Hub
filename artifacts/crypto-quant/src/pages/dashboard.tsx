import { useGetDashboardStats, useGetMarketSummary, useGetExchangeStatus } from "@workspace/api-client-react";
import { TrendingUp, TrendingDown, Activity, BarChart2, Layers, AlertTriangle, ArrowUpRight, ArrowDownRight, Wifi, WifiOff, Radio } from "lucide-react";

const SOURCE_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  bitget_public_mainnet: { label: "Bitget 主網即時行情", color: "text-emerald-400", icon: Radio },
  unavailable: { label: "行情暫時無法取得", color: "text-red-400", icon: WifiOff },
};

function DataSourceBadge({ source, lastUpdated }: { source?: string; lastUpdated?: string }) {
  const cfg = SOURCE_LABELS[source ?? "unavailable"] ?? SOURCE_LABELS.unavailable;
  const Icon = cfg.icon;
  const age = lastUpdated ? Math.round((Date.now() - new Date(lastUpdated).getTime()) / 1000) : null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon size={11} className={cfg.color} />
      <span className={cfg.color}>{cfg.label}</span>
      {age !== null && <span>· {age < 60 ? `${age}秒前` : `${Math.round(age / 60)}分鐘前`}更新</span>}
    </div>
  );
}

function MarketTicker({ tickers }: { tickers: Array<{ symbol: string; price: number; changePct24h: number }> }) {
  if (tickers.length === 0) {
    return (
      <div className="border-b border-border bg-card/50 px-4 py-2 text-xs text-red-400">
        Bitget 公開主網行情暫時無法取得
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-card/50 overflow-hidden">
      <div className="flex animate-marquee whitespace-nowrap">
        {[...tickers, ...tickers].map((ticker, index) => (
          <div key={`${ticker.symbol}-${index}`} className="inline-flex items-center gap-2 px-6 py-2 border-r border-border/40">
            <span className="text-xs font-mono font-semibold text-foreground">{ticker.symbol}</span>
            <span className="text-xs font-mono text-foreground">
              {ticker.price < 1 ? ticker.price.toFixed(4) : ticker.price.toLocaleString()}
            </span>
            <span className={`text-xs font-mono flex items-center gap-0.5 ${ticker.changePct24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {ticker.changePct24h >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
              {Math.abs(ticker.changePct24h).toFixed(2)}%
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
    <div className="bg-card border border-border rounded-lg p-4">
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

export default function Dashboard() {
  const { data: stats } = useGetDashboardStats();
  const { data: market } = useGetMarketSummary();
  const { data: exchStatus } = useGetExchangeStatus();

  const systemMode = exchStatus?.systemMode ?? "paper";
  const tickers = market?.data ?? [];
  const marketSource = market?.source ?? "unavailable";
  const marketLastUpdated = market?.lastUpdated;
  const isMarketConnected = marketSource === "bitget_public_mainnet" && tickers.length > 0;

  const s = stats ?? {
    totalStrategies: 0,
    activeStrategies: 0,
    totalBacktests: 0,
    totalTrades: 0,
    paperTradingPnl: 0,
    paperTradingPnlPct: 0,
    systemMode: "paper" as const,
    recentActivity: [],
  };

  const modeLabel = systemMode === "live" ? "真實交易" : "模擬模式";
  const modeBg = systemMode === "live" ? "bg-red-500/10 border-red-500/40 text-red-400" : "bg-primary/10 border-primary/40 text-primary";
  const modeDot = systemMode === "live" ? "bg-red-400" : "bg-primary";

  return (
    <div className="flex flex-col">
      <MarketTicker tickers={tickers} />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">系統儀表板</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Bitget 真實行情 · 量化交易研究平台</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${modeBg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${modeDot} animate-pulse`} />
            <span className="text-xs font-medium">{modeLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 p-3 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2">
            {isMarketConnected
              ? <Wifi size={14} className="text-emerald-400" />
              : <WifiOff size={14} className="text-red-400" />}
            <span className="text-xs text-foreground">
              {isMarketConnected ? "Bitget 公開主網行情已連線" : "Bitget 行情暫時無法取得"}
            </span>
          </div>
          <div className="ml-auto">
            <DataSourceBadge source={marketSource} lastUpdated={marketLastUpdated} />
          </div>
        </div>

        {systemMode === "live" && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-950/40 border-2 border-red-500/60">
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-300 font-semibold">
              ⚠️ 真實交易模式已啟用 — 所有訂單將使用真實資金。本系統不提供任何投資建議。
            </p>
          </div>
        )}

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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">市場行情</h2>
              <DataSourceBadge source={marketSource} lastUpdated={marketLastUpdated} />
            </div>
            {tickers.length === 0 ? (
              <p className="text-xs text-red-400">Bitget 公開主網行情暫時無法取得，請稍後重新整理。</p>
            ) : (
              <div className="space-y-2">
                {tickers.map((ticker) => (
                  <div key={ticker.symbol} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
                        {ticker.symbol.split("/")[0][0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{ticker.symbol}</p>
                        <p className="text-xs text-muted-foreground">24h 成交量 ${((ticker.volume24h ?? 0) / 1e9).toFixed(1)}B</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-semibold text-foreground">
                        ${!ticker.price ? "—" : ticker.price < 1 ? ticker.price.toFixed(4) : ticker.price.toLocaleString()}
                      </p>
                      <p className={`text-xs font-mono flex items-center justify-end gap-0.5 ${ticker.changePct24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {ticker.changePct24h >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                        {Math.abs(ticker.changePct24h).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-foreground mb-4">最新動態</h2>
            {s.recentActivity.length === 0 ? (
              <p className="text-xs text-muted-foreground">目前尚無交易或回測紀錄。</p>
            ) : (
              <div className="space-y-3">
                {s.recentActivity.map((item) => (
                  <div key={item.id} className="flex items-start gap-3">
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
            )}
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
