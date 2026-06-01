import { useEffect, useState } from "react";
import { Activity, Database, RefreshCw, ShieldCheck, Wallet, Wifi, AlertTriangle } from "lucide-react";

interface BitgetStatus {
  exchange: string;
  configured: boolean;
  networkMode: "mainnet" | "testnet";
  liveTradingEnabled: boolean;
  demoTradingEnabled: boolean;
  credentialsSource: string;
}

interface BitgetBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

interface BitgetAccount {
  exchange: string;
  networkMode: string;
  balances: BitgetBalance[];
  lastUpdated: string;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({ error: "回傳格式不是 JSON" }));
  if (!response.ok) {
    throw new Error(payload.error ?? JSON.stringify(payload));
  }
  return payload as T;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function Bitget() {
  const [status, setStatus] = useState<BitgetStatus | null>(null);
  const [account, setAccount] = useState<BitgetAccount | null>(null);
  const [message, setMessage] = useState("尚未測試連線");
  const [loading, setLoading] = useState(false);
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [type, setType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [quantity, setQuantity] = useState("10");
  const [price, setPrice] = useState("");
  const [confirmDemo, setConfirmDemo] = useState(false);

  async function loadStatus() {
    setLoading(true);
    try {
      const data = await api<BitgetStatus>("/api/bitget/status");
      setStatus(data);
      setMessage(data.configured ? "Bitget Variables 已設定" : "尚未設定 Bitget Variables");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "讀取狀態失敗");
    } finally {
      setLoading(false);
    }
  }

  async function testConnection() {
    setLoading(true);
    try {
      const data = await api<{ success: boolean; exchange: string; networkMode: string; assetCount: number; usdtBalance: string }>(
        "/api/bitget/test-connection",
        { method: "POST" },
      );
      setMessage(`Bitget ${data.networkMode} 已連線 · 資產項目 ${data.assetCount} · USDT ${data.usdtBalance}`);
      await loadAccount();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bitget 連線測試失敗");
    } finally {
      setLoading(false);
    }
  }

  async function loadAccount() {
    setLoading(true);
    try {
      const data = await api<BitgetAccount>("/api/bitget/account");
      setAccount({ ...data, balances: data.balances.filter((item) => item.total > 0).slice(0, 30) });
      setMessage(`已更新 Bitget 資產 · ${new Date(data.lastUpdated).toLocaleString("zh-TW")}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bitget 資產取得失敗");
    } finally {
      setLoading(false);
    }
  }

  async function placeDemoOrder() {
    setLoading(true);
    try {
      const data = await api<{ orderId: string; message: string }>("/api/bitget/demo-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, side, type, quantity, price: price || undefined, confirmDemo }),
      });
      setMessage(`${data.message} · Order ID ${data.orderId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bitget Demo 下單失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  const usdt = account?.balances.find((item) => item.asset === "USDT");

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Bitget API</h1>
        <p className="mt-1 text-xs text-muted-foreground">Bitget 主網真實行情 · Demo Trading 安全測試</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wifi size={14} /> API 狀態</div>
          <p className={`mt-2 text-lg font-bold ${status?.configured ? "text-emerald-400" : "text-amber-400"}`}>
            {status?.configured ? "已設定" : "尚未設定"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={14} /> 下單環境</div>
          <p className="mt-2 text-lg font-bold text-primary">{status?.networkMode ?? "testnet"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet size={14} /> Demo USDT</div>
          <p className="mt-2 text-lg font-bold font-mono text-foreground">{usdt?.free ?? 0}</p>
        </div>
      </div>

      <Card title="連線與資產">
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground leading-relaxed">
          Bitget 憑證只從 Railway Variables 讀取。系統不會在瀏覽器顯示 API Key、Secret 或 Passphrase。
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button onClick={() => void loadStatus()} disabled={loading} className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            <RefreshCw size={13} /> 重新整理狀態
          </button>
          <button onClick={() => void testConnection()} disabled={loading} className="flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50">
            <Activity size={13} /> 測試 Bitget 連線
          </button>
          <button onClick={() => void loadAccount()} disabled={loading} className="flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50">
            <Database size={13} /> 查看帳戶資產
          </button>
        </div>
        <div className="rounded-md bg-background p-3 text-xs font-mono text-muted-foreground break-words">{message}</div>
      </Card>

      <Card title="Bitget Demo 下單">
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 leading-relaxed">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>市價買入時，數量代表 USDT 金額；限價單與市價賣出則代表基礎幣數量。目前只允許 Demo Trading。</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">交易對
            <select value={symbol} onChange={(event) => setSymbol(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground">
              <option>BTC/USDT</option><option>ETH/USDT</option><option>SOL/USDT</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">方向
            <select value={side} onChange={(event) => setSide(event.target.value as "BUY" | "SELL")} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground">
              <option value="BUY">買入 BUY</option><option value="SELL">賣出 SELL</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">訂單類型
            <select value={type} onChange={(event) => setType(event.target.value as "MARKET" | "LIMIT")} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground">
              <option value="MARKET">市價 MARKET</option><option value="LIMIT">限價 LIMIT</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">數量
            <input value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground" />
          </label>
          {type === "LIMIT" && <label className="text-xs text-muted-foreground">限價
            <input value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground" />
          </label>}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={confirmDemo} onChange={(event) => setConfirmDemo(event.target.checked)} />
          我確認這是 Bitget Demo Trading 測試訂單
        </label>
        <button onClick={() => void placeDemoOrder()} disabled={loading || !confirmDemo} className="w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          送出 Demo 訂單
        </button>
      </Card>

      <Card title="帳戶資產">
        {!account ? <p className="text-xs text-muted-foreground">尚未讀取資產。</p> : account.balances.length === 0 ? <p className="text-xs text-muted-foreground">目前沒有非零資產。</p> : (
          <div className="space-y-2">
            {account.balances.map((item) => (
              <div key={item.asset} className="flex items-center justify-between border-b border-border/50 pb-2 text-xs last:border-0">
                <span className="font-semibold text-foreground">{item.asset}</span>
                <span className="font-mono text-muted-foreground">可用 {item.free} · 鎖定 {item.locked}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
