import { Router } from "express";
import { db, strategiesTable, backtestResultsTable, tradeRecordsTable } from "@workspace/db";
import { createBitgetService } from "../services/bitget.js";
import { createOkxService } from "../services/okx.js";

const router = Router();

const BITGET_PAIRS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
];

const OKX_PAIRS = [
  "BTC-USDT",
  "ETH-USDT",
  "SOL-USDT",
  "BNB-USDT",
  "XRP-USDT",
  "ADA-USDT",
  "DOGE-USDT",
  "AVAX-USDT",
];

type MarketRow = {
  symbol: string;
  price: number;
  change24h: number;
  changePct24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
};

type MarketProvider = "bitget" | "okx";

let lastRealFetch = 0;
let lastProvider: MarketProvider | null = null;
let cachedRealData: MarketRow[] | null = null;
const CACHE_TTL = 15_000;

function getProvider(): MarketProvider {
  return process.env.MARKET_DATA_SOURCE?.toLowerCase() === "okx" ? "okx" : "bitget";
}

async function fetchBitget(): Promise<MarketRow[]> {
  const tickers = await createBitgetService().getTickers(BITGET_PAIRS);
  return tickers.map((ticker) => {
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
}

async function fetchOkx(): Promise<MarketRow[]> {
  const tickers = await createOkxService().getTickers(OKX_PAIRS);
  return tickers.map((ticker) => {
    const price = Number(ticker.last);
    const open24h = Number(ticker.open24h);
    const change24h = price - open24h;
    const changePct24h = open24h > 0 ? (change24h / open24h) * 100 : 0;
    return {
      symbol: ticker.instId.replace("-", "/"),
      price,
      change24h,
      changePct24h,
      volume24h: Number(ticker.volCcy24h),
      high24h: Number(ticker.high24h),
      low24h: Number(ticker.low24h),
    };
  });
}

router.get("/summary", async (_req, res) => {
  const provider = getProvider();
  const source = provider === "okx" ? "okx_public_mainnet" : "bitget_public_mainnet";
  const now = Date.now();

  if (cachedRealData && lastProvider === provider && now - lastRealFetch < CACHE_TTL) {
    return res.json({
      source,
      provider,
      lastUpdated: new Date(lastRealFetch).toISOString(),
      data: cachedRealData,
    });
  }

  try {
    cachedRealData = provider === "okx" ? await fetchOkx() : await fetchBitget();
    lastProvider = provider;
    lastRealFetch = now;

    return res.json({
      source,
      provider,
      lastUpdated: new Date(lastRealFetch).toISOString(),
      data: cachedRealData,
    });
  } catch (error) {
    return res.status(502).json({
      source,
      provider,
      error:
        error instanceof Error
          ? error.message
          : `${provider.toUpperCase()} 公開主網行情暫時無法取得`,
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
