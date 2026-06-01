import { Router } from "express";
import { db, strategiesTable, backtestResultsTable, tradeRecordsTable } from "@workspace/db";

const router = Router();

const DEMO_MARKET_DATA = [
  { symbol: "BTC/USDT", price: 67342.5, change24h: 1824.3, changePct24h: 2.78, volume24h: 28_450_000_000, high24h: 68100.0, low24h: 65200.0 },
  { symbol: "ETH/USDT", price: 3521.8, change24h: -87.4, changePct24h: -2.42, volume24h: 12_300_000_000, high24h: 3650.0, low24h: 3480.0 },
  { symbol: "SOL/USDT", price: 182.45, change24h: 9.32, changePct24h: 5.38, volume24h: 3_200_000_000, high24h: 188.0, low24h: 172.0 },
  { symbol: "BNB/USDT", price: 598.2, change24h: -12.4, changePct24h: -2.03, volume24h: 1_800_000_000, high24h: 615.0, low24h: 590.0 },
  { symbol: "XRP/USDT", price: 0.5843, change24h: 0.0234, changePct24h: 4.17, volume24h: 2_100_000_000, high24h: 0.595, low24h: 0.558 },
  { symbol: "ADA/USDT", price: 0.4521, change24h: -0.0123, changePct24h: -2.65, volume24h: 890_000_000, high24h: 0.472, low24h: 0.445 },
  { symbol: "DOGE/USDT", price: 0.1623, change24h: 0.0089, changePct24h: 5.80, volume24h: 1_200_000_000, high24h: 0.168, low24h: 0.152 },
  { symbol: "AVAX/USDT", price: 36.82, change24h: 1.24, changePct24h: 3.49, volume24h: 650_000_000, high24h: 38.1, low24h: 35.3 },
];

router.get("/summary", async (req, res) => {
  const noise = () => (Math.random() - 0.5) * 0.002;
  res.json(DEMO_MARKET_DATA.map(t => ({
    ...t,
    price: Math.round(t.price * (1 + noise()) * 100) / 100,
  })));
});

router.get("/stats", async (req, res) => {
  const [strategies, backtests, trades] = await Promise.all([
    db.select().from(strategiesTable),
    db.select().from(backtestResultsTable),
    db.select().from(tradeRecordsTable),
  ]);

  const activeStrategies = strategies.filter(s => s.isActive);
  const paperPnl = trades.filter(t => t.mode === "paper").reduce((sum, t) => sum + Number(t.pnl), 0);

  const recentActivity = [
    { id: 1, type: "backtest", description: `回測完成：BTC 均線交叉策略，報酬率 +32.4%`, timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: 2, type: "trade", description: `模擬買入 BTC/USDT 0.05 枚 @ 67,342`, timestamp: new Date(Date.now() - 7200000).toISOString() },
    { id: 3, type: "risk", description: `風險警示：ETH 持倉接近單日虧損上限`, timestamp: new Date(Date.now() - 14400000).toISOString() },
    { id: 4, type: "strategy", description: `策略啟動：SOL 布林通道突破`, timestamp: new Date(Date.now() - 21600000).toISOString() },
    { id: 5, type: "backtest", description: `回測完成：ETH RSI 策略，勝率 58.3%`, timestamp: new Date(Date.now() - 86400000).toISOString() },
  ];

  res.json({
    totalStrategies: strategies.length,
    activeStrategies: activeStrategies.length,
    totalBacktests: backtests.length,
    totalTrades: trades.length,
    paperTradingPnl: Math.round(paperPnl * 100) / 100,
    paperTradingPnlPct: Math.round((paperPnl / 10000) * 10000) / 100,
    systemMode: "paper" as const,
    recentActivity,
  });
});

export default router;
