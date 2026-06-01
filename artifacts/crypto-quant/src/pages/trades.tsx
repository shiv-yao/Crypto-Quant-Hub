import { useState } from "react";
import { useListTrades } from "@workspace/api-client-react";
import { ArrowUpRight, ArrowDownRight, Filter } from "lucide-react";

const DEMO_TRADES = [
  { id: 1, symbol: "BTC/USDT", side: "sell", size: 0.02, price: 67100, fee: 1.342, pnl: 38.0, pnlPct: 0.89, strategyName: "BTC-USDT 網格交易", executedAt: new Date(Date.now() - 3600000).toISOString(), mode: "paper" },
  { id: 2, symbol: "ETH/USDT", side: "sell", size: 0.3, price: 3580, fee: 1.074, pnl: -24.6, pnlPct: -1.8, strategyName: "ETH RSI 超買超賣", executedAt: new Date(Date.now() - 7200000).toISOString(), mode: "paper" },
  { id: 3, symbol: "BTC/USDT", side: "sell", size: 0.03, price: 68200, fee: 2.046, pnl: 186.0, pnlPct: 2.98, strategyName: "BTC 均線交叉策略", executedAt: new Date(Date.now() - 14400000).toISOString(), mode: "paper" },
  { id: 4, symbol: "SOL/USDT", side: "sell", size: 5.0, price: 190, fee: 0.95, pnl: 62.5, pnlPct: 7.04, strategyName: "SOL 布林通道突破", executedAt: new Date(Date.now() - 86400000).toISOString(), mode: "paper" },
  { id: 5, symbol: "BTC/USDT", side: "buy", size: 0.02, price: 66000, fee: 1.32, pnl: -15.0, pnlPct: -0.45, strategyName: "BTC-USDT 網格交易", executedAt: new Date(Date.now() - 86400000 * 2).toISOString(), mode: "paper" },
  { id: 6, symbol: "ETH/USDT", side: "buy", size: 0.5, price: 3420, fee: 1.71, pnl: 105.0, pnlPct: 6.14, strategyName: "ETH RSI 超買超賣", executedAt: new Date(Date.now() - 86400000 * 3).toISOString(), mode: "paper" },
  { id: 7, symbol: "BTC/USDT", side: "buy", size: 0.05, price: 65200, fee: 3.26, pnl: 107.1, pnlPct: 3.28, strategyName: "BTC 均線交叉策略", executedAt: new Date(Date.now() - 86400000 * 4).toISOString(), mode: "paper" },
  { id: 8, symbol: "SOL/USDT", side: "buy", size: 2.5, price: 175.3, fee: 0.438, pnl: 17.875, pnlPct: 4.08, strategyName: "SOL 布林通道突破", executedAt: new Date(Date.now() - 86400000 * 5).toISOString(), mode: "paper" },
];

const SYMBOLS = ["全部", "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];
const SIDES = [{ value: "", label: "全部" }, { value: "buy", label: "買入" }, { value: "sell", label: "賣出" }];

export default function Trades() {
  const { data: trades } = useListTrades();
  const [symbolFilter, setSymbolFilter] = useState("全部");
  const [sideFilter, setSideFilter] = useState("");

  const list = (trades && trades.length > 0) ? trades : DEMO_TRADES;

  const filtered = list.filter(t =>
    (symbolFilter === "全部" || t.symbol === symbolFilter) &&
    (sideFilter === "" || t.side === sideFilter)
  );

  const totalPnl = filtered.reduce((sum, t) => sum + t.pnl, 0);
  const wins = filtered.filter(t => t.pnl > 0).length;
  const winRate = filtered.length > 0 ? (wins / filtered.length * 100).toFixed(1) : "0";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">交易紀錄</h1>
        <p className="text-xs text-muted-foreground mt-0.5">所有模擬交易的完整紀錄</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">已篩選筆數</p>
          <p className="text-2xl font-bold font-mono text-foreground">{filtered.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">總損益</p>
          <p className={`text-2xl font-bold font-mono ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">勝率</p>
          <p className="text-2xl font-bold font-mono text-foreground">{winRate}%</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-3 mb-4">
          <Filter size={12} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">篩選條件</span>
          <div className="flex items-center gap-2">
            <select value={symbolFilter} onChange={e => setSymbolFilter(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              data-testid="select-symbol-filter">
              {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={sideFilter} onChange={e => setSideFilter(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              data-testid="select-side-filter">
              {SIDES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">交易對</th>
                <th className="text-left py-2 px-3 font-medium">方向</th>
                <th className="text-right py-2 px-3 font-medium">數量</th>
                <th className="text-right py-2 px-3 font-medium">成交價</th>
                <th className="text-right py-2 px-3 font-medium">手續費</th>
                <th className="text-right py-2 px-3 font-medium">損益</th>
                <th className="text-right py-2 px-3 font-medium">報酬率</th>
                <th className="text-left py-2 px-3 font-medium">策略</th>
                <th className="text-left py-2 px-3 font-medium">時間</th>
                <th className="text-left py-2 px-3 font-medium">模式</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-b border-border/30 hover:bg-accent/20" data-testid={`row-trade-record-${t.id}`}>
                  <td className="py-2.5 px-3 font-semibold text-foreground">{t.symbol}</td>
                  <td className="py-2.5 px-3">
                    <span className={`flex items-center gap-0.5 ${t.side === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                      {t.side === "buy" ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                      {t.side === "buy" ? "買入" : "賣出"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-foreground">{t.size}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-foreground">${t.price.toLocaleString()}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">${t.fee.toFixed(3)}</td>
                  <td className={`py-2.5 px-3 text-right font-mono font-semibold ${t.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                  </td>
                  <td className={`py-2.5 px-3 text-right font-mono ${t.pnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground max-w-[140px] truncate">{t.strategyName}</td>
                  <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                    {new Date(t.executedAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary border border-primary/20">
                      {t.mode === "paper" ? "模擬" : "實盤"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground text-xs py-8">無符合條件的交易紀錄</p>
          )}
        </div>
      </div>
    </div>
  );
}
