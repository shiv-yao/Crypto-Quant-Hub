import { Router } from "express";
import { z } from "zod";
import { createOkxService, type OkxNetworkMode } from "../services/okx.js";

const router = Router();

type SystemTestStatus = "passed" | "failed" | "skipped";
type SystemTestStep = {
  name: string;
  status: SystemTestStatus;
  durationMs: number;
  details?: Record<string, unknown>;
  error?: string;
};

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

const SystemTestSchema = z.object({
  symbol: z.string().default("BTC/USDT"),
  testUsdt: z.number().positive().max(20).default(10),
  executeDemoOrder: z.boolean().default(true),
  confirmDemo: z.literal(true),
});

router.post("/system-test", async (req, res) => {
  if (getNetworkMode() !== "testnet") {
    return res.status(403).json({
      success: false,
      error: "全系統測試只允許 OKX Demo Trading。請將 OKX_NETWORK_MODE 設為 testnet。",
    });
  }

  const body = SystemTestSchema.parse(req.body);
  const startedAt = new Date();
  const steps: SystemTestStep[] = [];

  async function runStep<T>(name: string, fn: () => Promise<{ value: T; details?: Record<string, unknown> }>): Promise<T | null> {
    const started = Date.now();
    try {
      const result = await fn();
      steps.push({ name, status: "passed", durationMs: Date.now() - started, details: result.details });
      return result.value;
    } catch (error) {
      steps.push({
        name,
        status: "failed",
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : "未知錯誤",
      });
      return null;
    }
  }

  await runStep("環境安全檢查", async () => ({
    value: true,
    details: { networkMode: getNetworkMode(), liveTradingEnabled: false, maxTestUsdt: 20 },
  }));

  const publicClient = createOkxService();
  const ticker = await runStep("OKX 公開主網行情", async () => {
    const rows = await publicClient.getTickers([body.symbol]);
    const first = rows[0];
    if (!first) throw new Error(`找不到 ${body.symbol} 行情`);
    return {
      value: first,
      details: { symbol: first.instId, last: first.last, high24h: first.high24h, low24h: first.low24h },
    };
  });

  await runStep("OKX K 線", async () => {
    const rows = await publicClient.getKlines(body.symbol, "1m", 5);
    if (rows.length === 0) throw new Error("K 線資料為空");
    return { value: rows, details: { candleCount: rows.length, latestClose: rows[0]?.close ?? null } };
  });

  const privateClient = await runStep("OKX Demo API 憑證", async () => {
    if (!hasCredentials()) throw new Error("OKX Demo API Variables 尚未設定完整");
    return { value: getPrivateClient(), details: { configured: true, credentialsSource: "railway_variables" } };
  });

  const availableUsdt = privateClient
    ? await runStep("OKX Demo 帳戶資產", async () => {
        const balances = await privateClient.getAccountBalance();
        const details = balances.flatMap((item) => item.details ?? []);
        const usdt = details.find((item) => item.ccy.toUpperCase() === "USDT");
        const available = Number(usdt?.availBal ?? 0);
        return { value: available, details: { assetCount: details.length, availableUsdt: available } };
      })
    : null;

  if (!body.executeDemoOrder) {
    steps.push({ name: "OKX Demo 市價單", status: "skipped", durationMs: 0, details: { reason: "executeDemoOrder=false" } });
  } else if (!privateClient) {
    steps.push({ name: "OKX Demo 市價單", status: "skipped", durationMs: 0, details: { reason: "Demo API 憑證檢查未通過" } });
  } else if (availableUsdt === null || availableUsdt < body.testUsdt) {
    steps.push({
      name: "OKX Demo 市價單",
      status: "skipped",
      durationMs: 0,
      details: { reason: "Demo USDT 餘額不足", availableUsdt: availableUsdt ?? 0, requiredUsdt: body.testUsdt },
    });
  } else {
    await runStep("OKX Demo 市價單", async () => {
      const order = await privateClient.placeDemoOrder({
        symbol: body.symbol,
        side: "BUY",
        type: "MARKET",
        quantity: String(body.testUsdt),
      });
      return {
        value: order,
        details: { orderId: order.ordId, symbol: body.symbol, side: "BUY", type: "MARKET", testUsdt: body.testUsdt },
      };
    });
  }

  const failed = steps.filter((step) => step.status === "failed").length;
  const skipped = steps.filter((step) => step.status === "skipped").length;
  const passed = steps.filter((step) => step.status === "passed").length;
  const success = failed === 0 && skipped === 0;

  res.json({
    success,
    exchange: "OKX",
    mode: "demo",
    safeMode: true,
    symbol: body.symbol,
    tickerLast: ticker?.last ?? null,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    summary: { passed, failed, skipped, total: steps.length },
    steps,
    message: success ? "OKX 全系統 Demo 測試全部通過" : "OKX 全系統 Demo 測試未完全通過，請查看步驟結果",
  });
});

export default router;
