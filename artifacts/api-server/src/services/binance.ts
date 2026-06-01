import { createHmac } from "crypto";

export type NetworkMode = "mainnet" | "testnet";
export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus = "NEW" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED" | "REJECTED" | "EXPIRED";

export interface BinanceTicker {
  symbol: string;
  price?: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  volume: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
  weightedAvgPrice?: string;
}

export interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteVolume: string;
  trades: number;
}

export interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface BinanceAccount {
  balances: BinanceBalance[];
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  accountType: string;
}

export interface BinanceSymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  filters: Array<{
    filterType: string;
    minQty?: string;
    maxQty?: string;
    stepSize?: string;
    minPrice?: string;
    maxPrice?: string;
    tickSize?: string;
    minNotional?: string;
    notional?: string;
  }>;
}

export interface BinancePlaceOrderResult {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  status: OrderStatus;
  type: string;
  side: string;
  fills?: Array<{ price: string; qty: string; commission: string; commissionAsset: string }>;
}

export interface BinanceOrder {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  status: OrderStatus;
  type: string;
  side: string;
  time: number;
  updateTime: number;
}

const BASE_URLS: Record<NetworkMode, string> = {
  mainnet: "https://api.binance.com",
  testnet: "https://testnet.binance.vision",
};

export class BinanceService {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string, network: NetworkMode = "testnet") {
    this.baseUrl = BASE_URLS[network];
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private sign(queryString: string): string {
    return createHmac("sha256", this.apiSecret)
      .update(queryString)
      .digest("hex");
  }

  private async publicGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    const url = `${this.baseUrl}${path}${qs ? "?" + qs : ""}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "QuantSys/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Binance API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  private async privateGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const timestamp = Date.now();
    const allParams = { ...params, timestamp };
    const qs = new URLSearchParams(Object.entries(allParams).map(([k, v]) => [k, String(v)])).toString();
    const signature = this.sign(qs);
    const url = `${this.baseUrl}${path}?${qs}&signature=${signature}`;
    const res = await fetch(url, {
      headers: {
        "X-MBX-APIKEY": this.apiKey,
        "User-Agent": "QuantSys/1.0",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Binance API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  private async privatePost<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const timestamp = Date.now();
    const allParams = { ...params, timestamp };
    const qs = new URLSearchParams(Object.entries(allParams).map(([k, v]) => [k, String(v)])).toString();
    const signature = this.sign(qs);
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-MBX-APIKEY": this.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "QuantSys/1.0",
      },
      body: `${qs}&signature=${signature}`,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Binance API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  private async privateDelete<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const timestamp = Date.now();
    const allParams = { ...params, timestamp };
    const qs = new URLSearchParams(Object.entries(allParams).map(([k, v]) => [k, String(v)])).toString();
    const signature = this.sign(qs);
    const url = `${this.baseUrl}${path}?${qs}&signature=${signature}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-MBX-APIKEY": this.apiKey,
        "User-Agent": "QuantSys/1.0",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Binance API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async ping(): Promise<void> {
    await this.publicGet("/api/v3/ping");
  }

  async serverTime(): Promise<number> {
    const data = await this.publicGet<{ serverTime: number }>("/api/v3/time");
    return data.serverTime;
  }

  async getTickers(symbols?: string[]): Promise<BinanceTicker[]> {
    const params: Record<string, string> = {};
    if (symbols && symbols.length > 0) {
      const bnbSymbols = symbols.map(s => s.replace("/", ""));
      params.symbols = JSON.stringify(bnbSymbols);
    }
    const data = await this.publicGet<BinanceTicker | BinanceTicker[]>("/api/v3/ticker/24hr", params);
    return Array.isArray(data) ? data : [data];
  }

  async getKlines(symbol: string, interval: string, limit: number = 100): Promise<BinanceKline[]> {
    const bnbSymbol = symbol.replace("/", "");
    const raw = await this.publicGet<unknown[][]>("/api/v3/klines", {
      symbol: bnbSymbol,
      interval,
      limit,
    });
    return raw.map(k => ({
      openTime: k[0] as number,
      open: k[1] as string,
      high: k[2] as string,
      low: k[3] as string,
      close: k[4] as string,
      volume: k[5] as string,
      closeTime: k[6] as number,
      quoteVolume: k[7] as string,
      trades: k[8] as number,
    }));
  }

  async getExchangeInfo(symbols?: string[]): Promise<{ symbols: BinanceSymbolInfo[] }> {
    const params: Record<string, string> = {};
    if (symbols && symbols.length > 0) {
      const bnbSymbols = symbols.map(s => s.replace("/", ""));
      params.symbols = JSON.stringify(bnbSymbols);
    }
    return this.publicGet("/api/v3/exchangeInfo", params);
  }

  async getAccount(): Promise<BinanceAccount> {
    return this.privateGet("/api/v3/account");
  }

  async getOpenOrders(symbol?: string): Promise<BinanceOrder[]> {
    const params: Record<string, string> = {};
    if (symbol) params.symbol = symbol.replace("/", "");
    return this.privateGet("/api/v3/openOrders", params);
  }

  async getOrderHistory(symbol: string, limit: number = 20): Promise<BinanceOrder[]> {
    return this.privateGet("/api/v3/allOrders", {
      symbol: symbol.replace("/", ""),
      limit,
    });
  }

  async placeOrder(params: {
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: string;
    price?: string;
    timeInForce?: "GTC" | "IOC" | "FOK";
    newClientOrderId?: string;
  }): Promise<BinancePlaceOrderResult> {
    const orderParams: Record<string, string | number> = {
      symbol: params.symbol.replace("/", ""),
      side: params.side,
      type: params.type,
      quantity: params.quantity,
    };
    if (params.type === "LIMIT") {
      orderParams.price = params.price ?? "";
      orderParams.timeInForce = params.timeInForce ?? "GTC";
    }
    if (params.newClientOrderId) {
      orderParams.newClientOrderId = params.newClientOrderId;
    }
    return this.privatePost("/api/v3/order", orderParams);
  }

  async cancelOrder(symbol: string, orderId: number): Promise<BinanceOrder> {
    return this.privateDelete("/api/v3/order", {
      symbol: symbol.replace("/", ""),
      orderId,
    });
  }

  async testOrder(params: {
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: string;
    price?: string;
    timeInForce?: "GTC" | "IOC" | "FOK";
  }): Promise<void> {
    const orderParams: Record<string, string | number> = {
      symbol: params.symbol.replace("/", ""),
      side: params.side,
      type: params.type,
      quantity: params.quantity,
    };
    if (params.type === "LIMIT") {
      orderParams.price = params.price ?? "";
      orderParams.timeInForce = params.timeInForce ?? "GTC";
    }
    await this.privatePost("/api/v3/order/test", orderParams);
  }
}

export function createBinanceService(apiKey: string, apiSecret: string, network: NetworkMode): BinanceService {
  return new BinanceService(apiKey, apiSecret, network);
}
