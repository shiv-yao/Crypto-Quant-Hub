import { Router } from "express";
import { z } from "zod";
import { createBitgetService, type BitgetNetworkMode } from "../services/bitget.js";

const router = Router();

function getNetworkMode(): BitgetNetworkMode {
  return process.env.BITGET_NETWORK_MODE === "mainnet" ? "mainnet" : "testnet";
}

function getCredentials() {
  return {
    apiKey: process.env.BITGET_API_KEY ?? "",
    apiSecret: process.env.BITGET_API_SECRET ?? "",
    passphrase: process.env.BITGET_API_PASSPHRASE ?? "",
  };
}

function hasCredentials(): boolean {
  const { apiKey, apiSecret, passphrase } = getCredentials();
  return Boolean(apiKey && apiSecret && passphrase);
}

function getPrivateClient() {
  const { apiKey, apiSecret, passphrase } = getCredentials();
  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error(
      "Bitget 尚未設定。請在 Railway Variables 加入 BITGET_API_KEY、BITGET_API_SECRET、BITGET_API_PASSPHRASE。",
    );
  }
  return createBitgetService(apiKey, apiSecret, passphrase, getNetworkMode());
}

router.get("/status", (_req, res) => {
  res.json({
    exchange: "Bitget",
    configured: hasCredentials(),
    networkMode: getNetworkMode(),
    liveTradingEnabled: false,
    demoTradingEnabled: getNetworkMode() === "testnet",
    credentialsSource: "railway_variables",
  });
});

router.get("/summary", async (_req, res) => {
  try {
    const symbols = [
      "BTCUSDT",
      "ETHUSDT",
      "SOLUSDT",
      "BNBUSDT",
      "XRPUSDT",
      "ADAUSDT",
      "DOGEUSDT",
      "AVAXUSDT",
    ];
    const rows = await createBitgetService().getTickers(symbols);
    res.json({
      source: "bitget_public",
      lastUpdated: new Date().toISOString(),
      data: rows.map((ticker) => ({
        symbol: ticker.symbol.replace("USDT", "/USDT"),
        price: Number(ticker.lastPr),
        changePct24h: Number(ticker.change24h) * 100,
        volume24h: Number(ticker.quoteVolume),
        high24h: Number(ticker.high24h),
        low24h: Number(ticker.low24h),
      })),
    });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Bitget 公開行情取得失敗",
    });
  }
});

router.post("/test-connection", async (_req, res) => {
  try {
    const assets = await getPrivateClient().getAssets();
    const usdt = assets.find((asset) => asset.coin.toUpperCase() === "USDT");
    res.json({
      success: true,
      exchange: "Bitget",
      networkMode: getNetworkMode(),
      assetCount: assets.length,
      usdtBalance: usdt?.available ?? "0",
    });
  } catch (error) {
    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : "Bitget 連線失敗",
    });
  }
});

router.get("/account", async (_req, res) => {
  try {
    const assets = await getPrivateClient().getAssets();
    res.json({
      exchange: "Bitget",
      networkMode: getNetworkMode(),
      balances: assets.map((asset) => ({
        asset: asset.coin.toUpperCase(),
        free: Number(asset.available),
        locked: Number(asset.locked ?? asset.frozen ?? 0),
        total:
          Number(asset.available) + Number(asset.locked ?? asset.frozen ?? 0),
      })),
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Bitget 資產取得失敗",
    });
  }
});

router.get("/klines", async (req, res) => {
  const symbol = String(req.query.symbol ?? "BTC/USDT");
  const interval = String(req.query.interval ?? "1h");
  const limit = Math.min(Number(req.query.limit ?? 100), 500);

  try {
    const rows = await createBitgetService().getKlines(symbol, interval, limit);
    res.json({
      exchange: "Bitget",
      source: "bitget_public",
      symbol,
      interval,
      data: rows.map((row) => ({
        time: row.openTime,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
      })),
    });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Bitget K 線取得失敗",
    });
  }
});

const DemoOrderSchema = z.object({
  symbol: z.string().default("BTC/USDT"),
  side: z.enum(["BUY", "SELL"]),
  type: z.enum(["MARKET", "LIMIT"]),
  quantity: z.string().min(1),
  price: z.string().optional(),
  confirmDemo: z.literal(true),
});

router.post("/demo-order", async (req, res) => {
  if (getNetworkMode() !== "testnet") {
    return res.status(403).json({
      error:
        "此端點只允許 Bitget Demo Trading。請將 BITGET_NETWORK_MODE 設為 testnet。",
    });
  }

  try {
    const body = DemoOrderSchema.parse(req.body);
    if (body.type === "LIMIT" && !body.price) {
      return res.status(400).json({ error: "限價單必須填寫 price" });
    }

    const order = await getPrivateClient().placeDemoOrder({
      symbol: body.symbol,
      side: body.side,
      type: body.type,
      quantity: body.quantity,
      price: body.price,
    });

    res.json({
      success: true,
      exchange: "Bitget",
      mode: "demo",
      orderId: order.orderId,
      clientOid: order.clientOid ?? null,
      message: "Bitget Demo 訂單已送出",
    });
  } catch (error) {
    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : "Bitget Demo 下單失敗",
    });
  }
});

export default router;
