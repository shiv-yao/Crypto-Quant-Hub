import { createHmac } from "node:crypto";

export type OkxNetworkMode = "mainnet" | "testnet";
export type OkxOrderSide = "BUY" | "SELL";
export type OkxOrderType = "MARKET" | "LIMIT";

interface OkxEnvelope<T> {
  code: string;
  msg?: string;
  data: T;
}

export interface OkxTicker {
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
  vol24h: string;
  volCcy24h: string;
  ts: string;
}

export interface OkxBalanceDetail {
  ccy: string;
  availBal: string;
  frozenBal: string;
  cashBal: string;
  eq: string;
}

export interface OkxAccountBalance {
  totalEq: string;
  details: OkxBalanceDetail[];
}

export interface OkxKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quoteVolume: string;
}

export interface OkxOrderResult {
  ordId: string;
  clOrdId?: string;
  sCode?: string;
  sMsg?: string;
}

const BASE_URL = "https://www.okx.com";

function mapBar(interval: string): string {
  const mapping: Record<string, string> = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1H",
    "2h": "2H",
    "4h": "4H",
    "6h": "6H",
    "12h": "12H",
    "1d": "1D",
    "3d": "3D",
    "1w": "1W",
    "1M": "1M",
  };
  return mapping[interval] ?? interval;
}

function normalizeInstrument(symbol: string): string {
  if (symbol.includes("-")) return symbol.toUpperCase();
  if (symbol.includes("/")) return symbol.replace("/", "-").toUpperCase();
  return symbol.replace(/USDT$/i, "-USDT").toUpperCase();
}

export class OkxService {
  constructor(
    private readonly apiKey = "",
    private readonly apiSecret = "",
    private readonly passphrase = "",
    private readonly networkMode: OkxNetworkMode = "mainnet",
  ) {}

  private sign(timestamp: string, method: string, requestPath: string, body: string): string {
    const payload = `${timestamp}${method.toUpperCase()}${requestPath}${body}`;
    return createHmac("sha256", this.apiSecret).update(payload).digest("base64");
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: {
      query?: Record<string, string | number | undefined>;
      body?: Record<string, unknown>;
      auth?: boolean;
    } = {},
  ): Promise<T> {
    const query = new URLSearchParams(
      Object.entries(options.query ?? {})
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    ).toString();
    const requestPath = `${path}${query ? `?${query}` : ""}`;
    const body = options.body ? JSON.stringify(options.body) : "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Crypto-Quant-Hub/1.0",
    };

    if (this.networkMode === "testnet") {
      headers["x-simulated-trading"] = "1";
    }

    if (options.auth) {
      if (!this.apiKey || !this.apiSecret || !this.passphrase) {
        throw new Error("OKX API Key、Secret 與 Passphrase 均必須設定");
      }
      const timestamp = new Date().toISOString();
      headers["OK-ACCESS-KEY"] = this.apiKey;
      headers["OK-ACCESS-TIMESTAMP"] = timestamp;
      headers["OK-ACCESS-PASSPHRASE"] = this.passphrase;
      headers["OK-ACCESS-SIGN"] = this.sign(timestamp, method, requestPath, body);
    }

    const response = await fetch(`${BASE_URL}${requestPath}`, {
      method,
      headers,
      body: method === "POST" ? body : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const raw = await response.text();
    let envelope: OkxEnvelope<T>;
    try {
      envelope = JSON.parse(raw) as OkxEnvelope<T>;
    } catch {
      throw new Error(`OKX API 回傳無法解析：HTTP ${response.status}`);
    }

    if (!response.ok || envelope.code !== "0") {
      throw new Error(`OKX API error ${envelope.code || response.status}: ${envelope.msg ?? raw}`);
    }

    return envelope.data;
  }

  async getTickers(instIds?: string[]): Promise<OkxTicker[]> {
    const rows = await this.request<OkxTicker[]>("GET", "/api/v5/market/tickers", {
      query: { instType: "SPOT" },
    });
    if (!instIds?.length) return rows;
    const wanted = new Set(instIds.map(normalizeInstrument));
    return rows.filter((row) => wanted.has(row.instId.toUpperCase()));
  }

  async getAccountBalance(): Promise<OkxAccountBalance[]> {
    return this.request<OkxAccountBalance[]>("GET", "/api/v5/account/balance", {
      auth: true,
    });
  }

  async getKlines(symbol: string, interval: string, limit = 100): Promise<OkxKline[]> {
    const rows = await this.request<string[][]>("GET", "/api/v5/market/candles", {
      query: {
        instId: normalizeInstrument(symbol),
        bar: mapBar(interval),
        limit,
      },
    });
    return rows.map((row) => ({
      openTime: Number(row[0]),
      open: row[1],
      high: row[2],
      low: row[3],
      close: row[4],
      volume: row[5],
      quoteVolume: row[7] ?? row[6],
    }));
  }

  async placeDemoOrder(params: {
    symbol: string;
    side: OkxOrderSide;
    type: OkxOrderType;
    quantity: string;
    price?: string;
  }): Promise<OkxOrderResult> {
    if (this.networkMode !== "testnet") {
      throw new Error("OKX 真實下單未開放；請使用 testnet Demo Trading");
    }

    const body: Record<string, string> = {
      instId: normalizeInstrument(params.symbol),
      tdMode: "cash",
      side: params.side.toLowerCase(),
      ordType: params.type.toLowerCase(),
      sz: params.quantity,
    };

    if (params.type === "MARKET") {
      body.tgtCcy = params.side === "BUY" ? "quote_ccy" : "base_ccy";
    }

    if (params.type === "LIMIT") {
      body.px = params.price ?? "";
    }

    const rows = await this.request<OkxOrderResult[]>("POST", "/api/v5/trade/order", {
      body,
      auth: true,
    });

    const result = rows[0];
    if (!result) throw new Error("OKX 下單回傳為空");
    if (result.sCode && result.sCode !== "0") {
      throw new Error(`OKX 下單失敗 ${result.sCode}: ${result.sMsg ?? "未知錯誤"}`);
    }
    return result;
  }
}

export function createOkxService(
  apiKey = "",
  apiSecret = "",
  passphrase = "",
  networkMode: OkxNetworkMode = "mainnet",
): OkxService {
  return new OkxService(apiKey, apiSecret, passphrase, networkMode);
}
