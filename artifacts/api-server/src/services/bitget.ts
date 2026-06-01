import { createHmac } from "node:crypto";

export type BitgetNetworkMode = "mainnet" | "testnet";
export type BitgetOrderSide = "BUY" | "SELL";
export type BitgetOrderType = "MARKET" | "LIMIT";

interface BitgetEnvelope<T> {
  code: string;
  msg?: string;
  message?: string;
  data: T;
}

export interface BitgetAsset {
  coin: string;
  available: string;
  frozen?: string;
  locked?: string;
}

export interface BitgetTicker {
  symbol: string;
  high24h: string;
  low24h: string;
  lastPr: string;
  quoteVolume: string;
  change24h: string;
}

export interface BitgetKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quoteVolume: string;
}

export interface BitgetOrderResult {
  orderId: string;
  clientOid?: string;
}

const BASE_URL = "https://api.bitget.com";

function mapGranularity(interval: string): string {
  const mapping: Record<string, string> = {
    "1m": "1min",
    "3m": "3min",
    "5m": "5min",
    "15m": "15min",
    "30m": "30min",
    "1h": "1h",
    "4h": "4h",
    "6h": "6h",
    "12h": "12h",
    "1d": "1day",
    "3d": "3day",
    "1w": "1week",
    "1M": "1M",
  };
  return mapping[interval] ?? interval;
}

export class BitgetService {
  constructor(
    private readonly apiKey = "",
    private readonly apiSecret = "",
    private readonly passphrase = "",
    private readonly networkMode: BitgetNetworkMode = "mainnet",
  ) {}

  private sign(timestamp: string, method: string, path: string, query: string, body: string): string {
    const payload = `${timestamp}${method.toUpperCase()}${path}${query ? `?${query}` : ""}${body}`;
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
    const body = options.body ? JSON.stringify(options.body) : "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      locale: "en-US",
      "User-Agent": "Crypto-Quant-Hub/1.0",
    };

    if (this.networkMode === "testnet") {
      headers.paptrading = "1";
    }

    if (options.auth) {
      if (!this.apiKey || !this.apiSecret || !this.passphrase) {
        throw new Error("Bitget API Key、Secret 與 Passphrase 均必須設定");
      }
      const timestamp = String(Date.now());
      headers["ACCESS-KEY"] = this.apiKey;
      headers["ACCESS-TIMESTAMP"] = timestamp;
      headers["ACCESS-PASSPHRASE"] = this.passphrase;
      headers["ACCESS-SIGN"] = this.sign(timestamp, method, path, query, body);
    }

    const response = await fetch(`${BASE_URL}${path}${query ? `?${query}` : ""}`, {
      method,
      headers,
      body: method === "POST" ? body : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const raw = await response.text();
    let envelope: BitgetEnvelope<T>;
    try {
      envelope = JSON.parse(raw) as BitgetEnvelope<T>;
    } catch {
      throw new Error(`Bitget API 回傳無法解析：HTTP ${response.status}`);
    }
    if (!response.ok || envelope.code !== "00000") {
      throw new Error(`Bitget API error ${envelope.code || response.status}: ${envelope.msg ?? envelope.message ?? raw}`);
    }
    return envelope.data;
  }

  async getTickers(symbols?: string[]): Promise<BitgetTicker[]> {
    const data = await this.request<BitgetTicker[]>("GET", "/api/v2/spot/market/tickers");
    if (!symbols?.length) return data;
    const wanted = new Set(symbols.map(symbol => symbol.replace("/", "").toUpperCase()));
    return data.filter(ticker => wanted.has(ticker.symbol.toUpperCase()));
  }

  async getAssets(): Promise<BitgetAsset[]> {
    return this.request<BitgetAsset[]>("GET", "/api/v2/spot/account/assets", {
      query: { assetType: "all" },
      auth: true,
    });
  }

  async getKlines(symbol: string, interval: string, limit = 100): Promise<BitgetKline[]> {
    const rows = await this.request<string[][]>("GET", "/api/v2/spot/market/candles", {
      query: {
        symbol: symbol.replace("/", ""),
        granularity: mapGranularity(interval),
        limit,
      },
    });
    return rows.map(row => ({
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
    side: BitgetOrderSide;
    type: BitgetOrderType;
    quantity: string;
    price?: string;
  }): Promise<BitgetOrderResult> {
    if (this.networkMode !== "testnet") {
      throw new Error("Bitget 真實下單未開放；請使用 testnet Demo Trading");
    }
    const body: Record<string, string> = {
      symbol: params.symbol.replace("/", ""),
      side: params.side.toLowerCase(),
      orderType: params.type.toLowerCase(),
      size: params.quantity,
    };
    if (params.type === "LIMIT") {
      body.force = "gtc";
      body.price = params.price ?? "";
    }
    return this.request<BitgetOrderResult>("POST", "/api/v2/spot/trade/place-order", {
      body,
      auth: true,
    });
  }
}

export function createBitgetService(
  apiKey = "",
  apiSecret = "",
  passphrase = "",
  networkMode: BitgetNetworkMode = "mainnet",
): BitgetService {
  return new BitgetService(apiKey, apiSecret, passphrase, networkMode);
}
