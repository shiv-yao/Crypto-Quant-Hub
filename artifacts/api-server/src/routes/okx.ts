import { Router } from "express";
import { z } from "zod";
import { createOkxService, type OkxNetworkMode } from "../services/okx.js";

const router = Router();

function getNetworkMode(): OkxNetworkMode {
  return process.env.OKX_NETWORK_MODE === "mainnet" ? "mainnet" : "testnet";
}

function getCredentials() {
  return {
    apiKey: process.env.OKX_API_KEY ?? "",
    apiSecret: process.env.OKX_API_SECRET ?? "",
    passphrase: process.env.OKX_API_PASSPHRASE ?? "",
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
      "OKX 尚未設定。請在 Railway Variables 加入 OKX_API_KEY、OKX_API_SECRET、OKX_API_PASSPHRASE。",
    );
  }
  return createOkxService(apiKey, apiSecret, passphrase, getNetworkMode());
}

router.get("/status", (_req, res) => {
  res.json({
    exchange: "OKX",
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
      "BTC-USDT",
      "ETH-USDT",
      "SOL-USDT",
      "BNB-USDT",
      "XRP-USDT",
      "ADA-USDT",
      "DOGE-USDT",
      "AVAX-USDT",
    ];
    const rows = await createOkxService().getTickers(symbols);
    res.json({
      source: "okx_public_mainnet",
      lastUpdated: new Date().toISOString(),
      data: rows.map((ticker) => {
        const price = Number(ticker.last);
        const open24h = Number(ticker.open24h);
        const changePct24h = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;
        return {
          symbol: ticker.instId.replace("-", "/"),
          price,
          change24h: price - open24h,
          changePct24h,
          volume24h: Number(ticker.volCcy24h),
          high24h: Number(ticker.high24h),
          low24h: Number(ticker.low24h),
          timestamp: Number(ticker.ts),
        };
      }),
    });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "OKX 公開行情取得失敗",
      data: [],
    });
  }
});

router.post("/test-connection", async (_req, res) => {
  try {
    const balances = await getPrivateClient().getAccountBalance();
    const details = balances.flatMap((item) => item.details ?? []);
    const usdt = details.find((item) => item.ccy.toUpperCase() === "USDT");
    res.json({
      success: true,
      exchange: "OKX",
      networkMode: getNetworkMode(),
      assetCount: details.length,
      usdtBalance: usdt?.availBal ?? "0",
    });
  } catch (error) {
    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : "OKX 連線失敗",
    });
  }
});

router.get("/account", async (_req, res) => {
  try {
    const balances = await getPrivateClient().getAccountBalance();
    const details = balances.flatMap((item) => item.details ?? []);
    res.json({
      exchange: "OKX",
      networkMode: getNetworkMode(),
      balances: details.map((item) => ({
        asset: item.ccy.toUpperCase(),
        free: Number(item.availBal),
        locked: Number(item.frozenBal),
        total: Number(item.eq || item.cashBal || 0),
      })),
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "OKX 資產取得失敗",
    });
  }
});

router.get("/klines", async (req, res) => {
  const symbol = String(req.query.symbol ?? "BTC/USDT");
  const interval = String(req.query.interval ?? "1h");
  const limit = Math.min(Number(req.query.limit ?? 100), 300);

  try {
    const rows = await createOkxService().getKlines(symbol, interval, limit);
    res.json({
      exchange: "OKX",
      source: "okx_public_mainnet",
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
      error: error instanceof Error ? error.message : "OKX K 線取得失敗",
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
      error: "此端點只允許 OKX Demo Trading。請將 OKX_NETWORK_MODE 設為 testnet。",
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
      exchange: "OKX",
      mode: "demo",
      orderId: order.ordId,
      clientOrderId: order.clOrdId ?? null,
      message: "OKX Demo 訂單已送出",
    });
  } catch (error) {
    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : "OKX Demo 下單失敗",
    });
  }
});

export default router;
