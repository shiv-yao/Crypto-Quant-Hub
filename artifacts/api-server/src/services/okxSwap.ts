import { createHmac } from "node:crypto";

export type OkxSwapNetworkMode = "mainnet" | "testnet";
export type OkxSwapSide = "LONG" | "SHORT";

interface OkxEnvelope<T> {
  code: string;
  msg?: string;
  data: T;
}

export interface OkxSwapInstrument {
  instType: string;
  instId: string;
  uly?: string;
  instFamily?: string;
  settleCcy?: string;
  ctVal?: string;
  ctMult?: string;
  ctValCcy?: string;
  lotSz: string;
  minSz: string;
  tickSz: string;
  state: string;
}

export interface OkxSwapTicker {
  instType: string;
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
  vol24h: string;
  volCcy24h: string;
  ts: string;
}

export interface OkxSwapKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
}

export interface OkxSwapOrderResult {
  ordId: string;
  clOrdId?: string;
  sCode?: string;
  sMsg?: string;
}

export interface OkxSwapPosition {
  instId: string;
  posSide: string;
  pos: string;
  avgPx: string;
  markPx?: string;
  upl?: string;
  uplRatio?: string;
  lever?: string;
  mgnMode?: string;
}

const BASE_URL = "https://www.okx.com";

function decimalPlaces(value: string): number {
  const part = value.split(".")[1];
  return part ? part.length : 0;
}

function floorToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
  return Math.floor(value / step) * step;
}

export function contractsForNotional(instrument: OkxSwapInstrument, price: number, notionalUsdt: number): string {
  const contractValue = Number(instrument.ctVal ?? 0);
  const lotSize = Number(instrument.lotSz || 1);
  const minSize = Number(instrument.minSz || lotSize || 1);
  if (!(price > 0) || !(notionalUsdt > 0) || !(contractValue > 0) || !(lotSize > 0)) {
    throw new Error(`無法計算 ${instrument.instId} 合約張數`);
  }
  const raw = notionalUsdt / (price * contractValue);
  const size = Math.max(minSize, floorToStep(raw, lotSize));
  return size.toFixed(decimalPlaces(instrument.lotSz || "1"));
}

export class OkxSwapService {
  constructor(
    private readonly apiKey = "",
    private readonly apiSecret = "",
    private readonly passphrase = "",
    private readonly networkMode: OkxSwapNetworkMode = "mainnet",
  ) {}

  private sign(timestamp: string, method: string, requestPath: string, body: string): string {
    return createHmac("sha256", this.apiSecret)
      .update(`${timestamp}${method.toUpperCase()}${requestPath}${body}`)
      .digest("base64");
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: { query?: Record<string, string | number | undefined>; body?: Record<string, unknown>; auth?: boolean } = {},
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

    if (this.networkMode === "testnet") headers["x-simulated-trading"] = "1";

    if (options.auth) {
      if (!this.apiKey || !this.apiSecret || !this.passphrase) {
        throw new Error("OKX Demo API Key、Secret 與 Passphrase 尚未設定完整");
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
      signal: AbortSignal.timeout(12_000),
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

  async getSwapInstruments(): Promise<OkxSwapInstrument[]> {
    return this.request<OkxSwapInstrument[]>("GET", "/api/v5/public/instruments", {
      query: { instType: "SWAP" },
    });
  }

  async getSwapTickers(): Promise<OkxSwapTicker[]> {
    return this.request<OkxSwapTicker[]>("GET", "/api/v5/market/tickers", {
      query: { instType: "SWAP" },
    });
  }

  async getSwapKlines(instId: string, bar = "5m", limit = 80): Promise<OkxSwapKline[]> {
    const rows = await this.request<string[][]>("GET", "/api/v5/market/candles", {
      query: { instId, bar, limit },
    });
    return rows.map((row) => ({
      openTime: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      quoteVolume: Number(row[7] ?? row[6]),
    }));
  }

  async getSwapPositions(): Promise<OkxSwapPosition[]> {
    return this.request<OkxSwapPosition[]>("GET", "/api/v5/account/positions", {
      query: { instType: "SWAP" },
      auth: true,
    });
  }

  async setLeverage(instId: string, leverage: number, marginMode: "isolated" | "cross" = "isolated") {
    if (this.networkMode !== "testnet") throw new Error("OKX 合約主網實盤尚未開放");
    return this.request<Record<string, unknown>[]>("POST", "/api/v5/account/set-leverage", {
      body: { instId, lever: String(leverage), mgnMode: marginMode },
      auth: true,
    });
  }

  async placeSwapDemoOrder(params: {
    instId: string;
    side: OkxSwapSide;
    contracts: string;
    reduceOnly?: boolean;
    marginMode?: "isolated" | "cross";
  }): Promise<OkxSwapOrderResult> {
    if (this.networkMode !== "testnet") throw new Error("OKX 合約主網實盤尚未開放；僅允許 Demo Trading");
    const opening = !params.reduceOnly;
    const side = params.side === "LONG"
      ? (opening ? "buy" : "sell")
      : (opening ? "sell" : "buy");
    const rows = await this.request<OkxSwapOrderResult[]>("POST", "/api/v5/trade/order", {
      body: {
        instId: params.instId,
        tdMode: params.marginMode ?? "isolated",
        side,
        ordType: "market",
        sz: params.contracts,
        posSide: "net",
        reduceOnly: params.reduceOnly ? "true" : "false",
      },
      auth: true,
    });
    const result = rows[0];
    if (!result) throw new Error("OKX 合約下單回傳為空");
    if (result.sCode && result.sCode !== "0") {
      throw new Error(`OKX 合約下單失敗 ${result.sCode}: ${result.sMsg ?? "未知錯誤"}`);
    }
    return result;
  }
}

export function createOkxSwapService(
  apiKey = "",
  apiSecret = "",
  passphrase = "",
  networkMode: OkxSwapNetworkMode = "mainnet",
) {
  return new OkxSwapService(apiKey, apiSecret, passphrase, networkMode);
}
