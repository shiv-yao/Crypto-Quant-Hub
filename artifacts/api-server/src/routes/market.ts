import { Router } from "express";
import { db, strategiesTable, backtestResultsTable, tradeRecordsTable } from "@workspace/db";
import { createBitgetService } from "../services/bitget.js";

const router = Router();

const POPULAR_PAIRS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
];

let lastRealFetch = 0;
let cachedRealData: Array<{
  symbol: string;
  price: number;
  change24h: number;
  changePct24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}> | null = null;
const CACHE_TTL = 15_000;

router.get("/summary", async (_req, res) => {
  const now = Date.now();

  if (cachedRealData && now - lastRealFetch < CACHE_TTL) {
    return res.json({
      source: "bitget_public_mainnet",
      lastUpdated: new Date(lastRealFetch).toISOString(),
      data: cachedRealData,
    });
  }

  try {
    const tickers = await createBitgetService().getTickers(POPULAR_PAIRS);
    cachedRealData = tickers.map((ticker) => {
      const price = Number(ticker.lastPr);
      const changePct24h = Number(ticker.change24h) * 100;
      return {
        symbol: ticker.symbol.replace("USDT", "/USDT"),
        price,
        change24h: price * (changePct24h / 100),
        changePct24h,
        volume24h: Number(ticker.quoteVolume),
        high24h: Number(ticker.high24h),
        low24h: Number(ticker.low24h),
      };
    });
    lastRealFetch = now;

    return res.json({
      source: "bitget_public_mainnet",
      lastUpdated: new Date(lastRealFetch).toISOString(),
      data: cachedRealData,
    });
  } catch (error) {
    return res.status(502).json({
      source: "bitget_public_mainnet",
      error:
        error instanceof Error
          ? error.message
          : "Bitget 公開主網行情暫時無法取得",
      data: [],
    });
  }
});

router.get("/stats", async (_req, res) => {
  const [strategies, backtests, trades] = await Promise.all([
    db.select().from(strategiesTable),
    db.select().from(backtestResultsTable),
    db.select().from(tradeRecordsTable),
  ]);

  const activeStrategies = strategies.filter((strategy) => strategy.isActive);
  const paperPnl = trades
    .filter((trade) => trade.mode === "paper")
    .reduce((sum, trade) => sum + Number(trade.pnl), 0);

  res.json({
    totalStrategies: strategies.length,
    activeStrategies: activeStrategies.length,
    totalBacktests: backtests.length,
    totalTrades: trades.length,
    paperTradingPnl: Math.round(paperPnl * 100) / 100,
    paperTradingPnlPct: Math.round((paperPnl / 10000) * 10000) / 100,
    systemMode: "paper" as const,
    recentActivity: [],
  });
});

export default router;
