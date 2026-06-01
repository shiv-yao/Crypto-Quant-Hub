import { Router } from "express";
import { db, exchangeConnectionsTable, systemSettingsTable, auditLogsTable, riskSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createBinanceService, type NetworkMode } from "../services/binance.js";
import { encrypt, decrypt } from "../services/crypto.js";
import { validateOrder } from "../services/orderValidator.js";
import { z } from "zod";

const router = Router();

async function getConnection() {
  const rows = await db.select().from(exchangeConnectionsTable).limit(1);
  return rows[0] ?? null;
}

async function getSettings() {
  const rows = await db.select().from(systemSettingsTable).limit(1);
  return rows[0] ?? null;
}

function buildClient(conn: NonNullable<Awaited<ReturnType<typeof getConnection>>>) {
  if (!conn.apiKeyEncrypted || !conn.apiSecretEncrypted) {
    throw new Error("API 金鑰未設定");
  }
  const apiKey = decrypt(conn.apiKeyEncrypted);
  const apiSecret = decrypt(conn.apiSecretEncrypted);
  return createBinanceService(apiKey, apiSecret, (conn.networkMode as NetworkMode) ?? "testnet");
}

router.get("/status", async (req, res) => {
  const conn = await getConnection();
  const settings = await getSettings();
  res.json({
    exchange: conn?.exchange ?? "Binance",
    networkMode: conn?.networkMode ?? "testnet",
    isConnected: conn?.isConnected ?? false,
    apiKeySet: (conn?.apiKeyEncrypted ?? null) !== null,
    lastTestedAt: conn?.lastTestedAt?.toISOString() ?? null,
    connectionError: conn?.connectionError ?? null,
    systemMode: settings?.mode ?? "paper",
    liveReadyStep: settings?.liveReadyStep ?? 0,
    tradingEnabled: settings?.tradingEnabled ?? false,
  });
});

const SaveConfigSchema = z.object({
  apiKey: z.string().min(10, "API Key 至少 10 個字元"),
  apiSecret: z.string().min(10, "API Secret 至少 10 個字元"),
  networkMode: z.enum(["mainnet", "testnet"]).default("testnet"),
  exchange: z.string().default("Binance"),
});

router.post("/config", async (req, res) => {
  const body = SaveConfigSchema.parse(req.body);

  const encKey = encrypt(body.apiKey);
  const encSecret = encrypt(body.apiSecret);

  const existing = await getConnection();
  if (existing) {
    await db.update(exchangeConnectionsTable)
      .set({
        apiKeyEncrypted: encKey,
        apiSecretEncrypted: encSecret,
        networkMode: body.networkMode,
        exchange: body.exchange,
        isConnected: false,
        connectionError: null,
        updatedAt: new Date(),
      })
      .where(eq(exchangeConnectionsTable.id, existing.id));
  } else {
    await db.insert(exchangeConnectionsTable).values({
      apiKeyEncrypted: encKey,
      apiSecretEncrypted: encSecret,
      networkMode: body.networkMode,
      exchange: body.exchange,
    });
  }

  const settings = await getSettings();
  if (settings) {
    await db.update(systemSettingsTable)
      .set({ apiKeySet: true, liveReadyStep: Math.max(settings.liveReadyStep, 1), updatedAt: new Date() })
      .where(eq(systemSettingsTable.id, settings.id));
  } else {
    await db.insert(systemSettingsTable).values({ apiKeySet: true, liveReadyStep: 1 });
  }

  await db.insert(auditLogsTable).values({
    action: "api_key_saved",
    details: { exchange: body.exchange, networkMode: body.networkMode, keyPrefix: body.apiKey.slice(0, 4) + "****" },
    mode: "paper",
    source: "manual",
    result: "success",
  });

  res.json({ success: true, message: "API 金鑰已安全儲存於伺服器端" });
});

router.post("/test-connection", async (req, res) => {
  const conn = await getConnection();
  if (!conn?.apiKeyEncrypted) {
    return res.status(400).json({ success: false, error: "請先設定 API 金鑰" });
  }

  try {
    const client = buildClient(conn);
    const [serverTime, account] = await Promise.all([
      client.serverTime(),
      client.getAccount(),
    ]);

    const usdtBalance = account.balances.find(b => b.asset === "USDT");

    await db.update(exchangeConnectionsTable)
      .set({
        isConnected: true,
        lastTestedAt: new Date(),
        connectionError: null,
        accountInfo: {
          canTrade: account.canTrade,
          canWithdraw: account.canWithdraw,
          accountType: account.accountType,
          usdtBalance: usdtBalance ? { free: usdtBalance.free, locked: usdtBalance.locked } : null,
          serverTime,
        },
        updatedAt: new Date(),
      })
      .where(eq(exchangeConnectionsTable.id, conn.id));

    const settings = await getSettings();
    if (settings) {
      await db.update(systemSettingsTable)
        .set({
          connectionStatus: "connected",
          connectionError: null,
          lastConnectedAt: new Date(),
          liveReadyStep: Math.max(settings.liveReadyStep, 2),
          updatedAt: new Date(),
        })
        .where(eq(systemSettingsTable.id, settings.id));
    }

    await db.insert(auditLogsTable).values({
      action: "connection_test",
      details: {
        exchange: conn.exchange,
        networkMode: conn.networkMode,
        canTrade: account.canTrade,
        serverTime,
      },
      mode: "paper",
      source: "manual",
      result: "success",
    });

    res.json({
      success: true,
      canTrade: account.canTrade,
      canWithdraw: account.canWithdraw,
      accountType: account.accountType,
      networkMode: conn.networkMode,
      serverTime,
      usdtBalance: usdtBalance?.free ?? "0",
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "連線失敗";

    await db.update(exchangeConnectionsTable)
      .set({ isConnected: false, connectionError: errMsg, updatedAt: new Date() })
      .where(eq(exchangeConnectionsTable.id, conn.id));

    const settings = await getSettings();
    if (settings) {
      await db.update(systemSettingsTable)
        .set({ connectionStatus: "error", connectionError: errMsg, updatedAt: new Date() })
        .where(eq(systemSettingsTable.id, settings.id));
    }

    await db.insert(auditLogsTable).values({
      action: "connection_test",
      details: { exchange: conn.exchange, networkMode: conn.networkMode },
      mode: "paper",
      source: "manual",
      result: "error",
      errorMessage: errMsg,
    });

    res.status(502).json({ success: false, error: errMsg });
  }
});

router.get("/account", async (req, res) => {
  const conn = await getConnection();
  if (!conn?.apiKeyEncrypted || !conn.isConnected) {
    return res.status(400).json({ error: "交易所尚未連線，請先完成連線測試" });
  }
  try {
    const client = buildClient(conn);
    const account = await client.getAccount();
    const relevantAssets = ["USDT", "BTC", "ETH", "SOL", "BNB", "XRP", "ADA"];
    const balances = account.balances
      .filter(b => relevantAssets.includes(b.asset) || Number(b.free) > 0 || Number(b.locked) > 0)
      .map(b => ({
        asset: b.asset,
        free: Number(b.free),
        locked: Number(b.locked),
        total: Number(b.free) + Number(b.locked),
      }));
    res.json({
      canTrade: account.canTrade,
      canWithdraw: account.canWithdraw,
      accountType: account.accountType,
      balances,
      networkMode: conn.networkMode,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "取得帳戶失敗" });
  }
});

router.get("/pairs", async (req, res) => {
  const conn = await getConnection();
  const POPULAR = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT"];
  try {
    const client = conn?.apiKeyEncrypted
      ? buildClient(conn)
      : createBinanceService("", "", (conn?.networkMode as NetworkMode) ?? "testnet");
    const info = await client.getExchangeInfo(POPULAR);
    const pairs = info.symbols
      .filter(s => s.status === "TRADING" && s.quoteAsset === "USDT")
      .map(s => {
        const lotSize = s.filters.find(f => f.filterType === "LOT_SIZE");
        const priceFilter = s.filters.find(f => f.filterType === "PRICE_FILTER");
        const notional = s.filters.find(f => f.filterType === "NOTIONAL" || f.filterType === "MIN_NOTIONAL");
        return {
          symbol: `${s.baseAsset}/${s.quoteAsset}`,
          baseAsset: s.baseAsset,
          quoteAsset: s.quoteAsset,
          minQty: lotSize?.minQty ?? "0",
          maxQty: lotSize?.maxQty ?? "0",
          stepSize: lotSize?.stepSize ?? "0",
          tickSize: priceFilter?.tickSize ?? "0",
          minNotional: notional?.minNotional ?? notional?.notional ?? "0",
        };
      });
    res.json(pairs);
  } catch {
    const fallback = POPULAR.map(s => ({
      symbol: s.replace("USDT", "/USDT"),
      baseAsset: s.replace("USDT", ""),
      quoteAsset: "USDT",
      minQty: "0.00001",
      maxQty: "9000",
      stepSize: "0.00001",
      tickSize: "0.01",
      minNotional: "5",
    }));
    res.json(fallback);
  }
});

router.get("/klines", async (req, res) => {
  const symbol = String(req.query.symbol ?? "BTC/USDT");
  const interval = String(req.query.interval ?? "1h");
  const limit = Math.min(Number(req.query.limit ?? 100), 500);

  const conn = await getConnection();
  try {
    const client = conn?.apiKeyEncrypted
      ? buildClient(conn)
      : createBinanceService("", "", "testnet");
    const klines = await client.getKlines(symbol, interval, limit);
    res.json({
      symbol,
      interval,
      source: conn?.isConnected ? "binance_live" : "binance_public",
      data: klines.map(k => ({
        time: k.openTime,
        open: Number(k.open),
        high: Number(k.high),
        low: Number(k.low),
        close: Number(k.close),
        volume: Number(k.volume),
      })),
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "取得 K 線失敗" });
  }
});

const PlaceOrderSchema = z.object({
  symbol: z.string(),
  side: z.enum(["BUY", "SELL"]),
  type: z.enum(["MARKET", "LIMIT"]),
  quantity: z.number().positive(),
  price: z.number().positive().optional(),
  source: z.enum(["manual", "strategy"]).default("manual"),
  strategyName: z.string().optional(),
  confirmLive: z.boolean().optional(),
});

router.post("/place-order", async (req, res) => {
  const body = PlaceOrderSchema.parse(req.body);
  const settings = await getSettings();
  const mode = settings?.mode ?? "paper";

  if (mode === "live" && !body.confirmLive) {
    return res.status(400).json({
      error: "真實交易需要明確確認（confirmLive: true）",
      requiresConfirmation: true,
    });
  }

  if (mode === "live" && !settings?.tradingEnabled) {
    return res.status(403).json({ error: "真實交易未啟用，請在設定頁面完成安全設定" });
  }

  const conn = await getConnection();
  if ((mode === "live" || mode === "testnet") && !conn?.isConnected) {
    return res.status(400).json({ error: "交易所尚未連線" });
  }

  const validation = await validateOrder(
    {
      symbol: body.symbol,
      side: body.side,
      type: body.type,
      quantity: body.quantity,
      price: body.price,
      source: body.source,
      strategyName: body.strategyName,
      mode: mode as "paper" | "testnet" | "live",
    },
    null,
    10000,
    0,
    0,
  );

  if (!validation.passed) {
    return res.status(422).json({
      error: "下單前檢查未通過",
      errors: validation.errors,
      warnings: validation.warnings,
    });
  }

  if (mode === "paper") {
    return res.json({
      orderId: Math.floor(Math.random() * 1000000),
      symbol: body.symbol,
      side: body.side,
      type: body.type,
      quantity: body.quantity,
      price: body.price ?? 0,
      status: "FILLED",
      mode: "paper",
      warnings: validation.warnings,
      message: "模擬下單成功",
    });
  }

  try {
    const client = buildClient(conn!);
    let result;
    if (mode === "testnet" && body.type === "MARKET") {
      await client.testOrder({
        symbol: body.symbol,
        side: body.side,
        type: body.type,
        quantity: String(body.quantity),
      });
      result = {
        orderId: Math.floor(Math.random() * 1000000),
        symbol: body.symbol,
        side: body.side,
        type: body.type,
        origQty: String(body.quantity),
        executedQty: String(body.quantity),
        status: "FILLED" as const,
        fills: [],
      };
    } else {
      result = await client.placeOrder({
        symbol: body.symbol,
        side: body.side,
        type: body.type,
        quantity: String(body.quantity),
        price: body.price !== undefined ? String(body.price) : undefined,
      });
    }

    await db.insert(auditLogsTable).values({
      action: "order_placed",
      details: {
        symbol: body.symbol,
        side: body.side,
        type: body.type,
        quantity: body.quantity,
        price: body.price,
        orderId: result.orderId,
        status: result.status,
      },
      mode,
      source: body.source,
      result: "success",
    });

    res.json({
      orderId: result.orderId,
      symbol: result.symbol,
      side: result.side,
      type: result.type,
      quantity: Number(result.origQty),
      executedQty: Number(result.executedQty),
      status: result.status,
      price: body.price ?? 0,
      mode,
      warnings: validation.warnings,
      fills: result.fills,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "下單失敗";
    await db.insert(auditLogsTable).values({
      action: "order_placed",
      details: { symbol: body.symbol, side: body.side, quantity: body.quantity },
      mode,
      source: body.source,
      result: "error",
      errorMessage: errMsg,
    });
    res.status(502).json({ error: errMsg });
  }
});

router.get("/orders", async (req, res) => {
  const symbol = req.query.symbol as string | undefined;
  const conn = await getConnection();
  if (!conn?.isConnected) {
    return res.json([]);
  }
  try {
    const client = buildClient(conn);
    const orders = await client.getOpenOrders(symbol);
    res.json(orders.map(o => ({
      orderId: o.orderId,
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      origQty: Number(o.origQty),
      executedQty: Number(o.executedQty),
      price: Number(o.price),
      status: o.status,
      time: new Date(o.time).toISOString(),
    })));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "取得訂單失敗" });
  }
});

router.delete("/orders/:orderId", async (req, res) => {
  const orderId = Number(req.params.orderId);
  const symbol = req.query.symbol as string;
  if (!symbol) return res.status(400).json({ error: "需要交易對參數" });

  const conn = await getConnection();
  if (!conn?.isConnected) return res.status(400).json({ error: "交易所未連線" });

  try {
    const client = buildClient(conn);
    const result = await client.cancelOrder(symbol, orderId);
    await db.insert(auditLogsTable).values({
      action: "order_cancelled",
      details: { symbol, orderId },
      mode: "live",
      source: "manual",
      result: "success",
    });
    res.json({ success: true, orderId: result.orderId, status: result.status });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "取消訂單失敗" });
  }
});

const EnableLiveSchema = z.object({
  confirmText: z.literal("我了解真實交易的風險，並確認啟用"),
  riskAgreed: z.boolean(),
  noWithdrawConfirmed: z.boolean(),
});

router.post("/enable-live", async (req, res) => {
  const body = EnableLiveSchema.parse(req.body);

  if (!body.riskAgreed || !body.noWithdrawConfirmed) {
    return res.status(400).json({ error: "需要確認所有安全條款" });
  }

  const conn = await getConnection();
  if (!conn?.isConnected) {
    return res.status(400).json({ error: "請先完成交易所連線測試" });
  }

  const [risk] = await db.select().from(riskSettingsTable).limit(1);
  if (!risk) {
    return res.status(400).json({ error: "請先設定風控參數" });
  }

  const settings = await getSettings();
  if (settings) {
    await db.update(systemSettingsTable)
      .set({
        mode: conn.networkMode === "mainnet" ? "live" : "paper",
        tradingEnabled: true,
        liveReadyStep: 4,
        updatedAt: new Date(),
      })
      .where(eq(systemSettingsTable.id, settings.id));
  }

  await db.insert(auditLogsTable).values({
    action: "live_trading_enabled",
    details: {
      networkMode: conn.networkMode,
      exchange: conn.exchange,
      confirmText: "[redacted]",
    },
    mode: "live",
    source: "manual",
    result: "success",
  });

  res.json({
    success: true,
    mode: conn.networkMode === "mainnet" ? "live" : "testnet",
    message: conn.networkMode === "mainnet"
      ? "⚠️ 真實交易已啟用，所有訂單將使用真實資金"
      : "測試網交易已啟用",
  });
});

router.post("/disable-live", async (req, res) => {
  const settings = await getSettings();
  if (settings) {
    await db.update(systemSettingsTable)
      .set({ mode: "paper", tradingEnabled: false, liveReadyStep: 2, updatedAt: new Date() })
      .where(eq(systemSettingsTable.id, settings.id));
  }

  await db.insert(auditLogsTable).values({
    action: "live_trading_disabled",
    details: {},
    mode: "paper",
    source: "manual",
    result: "success",
  });

  res.json({ success: true, message: "已切換回模擬模式" });
});

export default router;
