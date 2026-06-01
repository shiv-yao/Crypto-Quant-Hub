import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetExchangeStatus, useGetExchangeAccount, getGetExchangeAccountQueryKey } from "@workspace/api-client-react";
import {
  AlertTriangle, TrendingUp, TrendingDown, RefreshCw, Loader2,
  ShieldAlert, CheckCircle2, XCircle, AlertCircle, Info, Wifi, WifiOff
} from "lucide-react";

type TMode = "paper" | "testnet" | "live";
type OrderSide = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT";

const MODE_CONFIG: Record<TMode, { label: string; color: string; bg: string; border: string; desc: string }> = {
  paper: {
    label: "模擬模式",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/40",
    desc: "使用假資金模擬下單，不涉及真實交易",
  },
  testnet: {
    label: "測試網",
    color: "text-amber-400",
    bg: "bg-amber-950/30",
    border: "border-amber-500/40",
    desc: "Binance 測試網，使用測試幣（非真實資金）",
  },
  live: {
    label: "⚠️ 真實交易",
    color: "text-red-400",
    bg: "bg-red-950/30",
    border: "border-red-500/60",
    desc: "使用真實資金，訂單直接送往 Binance 主網",
  },
};

const DEMO_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT"];

interface OrderResult {
  success: boolean;
  orderId?: number;
  symbol?: string;
  status?: string;
  mode?: string;
  warnings?: string[];
  message?: string;
  errors?: string[];
  error?: string;
}

function ModeTab({ mode, active, onClick, disabled }: { mode: TMode; active: boolean; onClick: () => void; disabled?: boolean }) {
  const c = MODE_CONFIG[mode];
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed
        ${active ? `${c.bg} ${c.border} ${c.color}` : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
      {c.label}
    </button>
  );
}

export default function Trading() {
  const qc = useQueryClient();
  const { data: exchStatus } = useGetExchangeStatus();
  const { data: account, refetch: refetchAccount } = useGetExchangeAccount({ query: { enabled: exchStatus?.isConnected ?? false } });

  const isConnected = exchStatus?.isConnected ?? false;
  const tradingEnabled = exchStatus?.tradingEnabled ?? false;
  const systemMode = (exchStatus?.systemMode ?? "paper") as TMode;

  const effectiveMode: TMode = tradingEnabled && isConnected
    ? (exchStatus?.networkMode === "mainnet" ? "live" : "testnet")
    : "paper";

  const [activeMode, setActiveMode] = useState<TMode>(effectiveMode);
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [side, setSide] = useState<OrderSide>("BUY");
  const [type, setType] = useState<OrderType>("LIMIT");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [confirmLive, setConfirmLive] = useState(false);

  const [placing, setPlacing] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

  const [orders, setOrders] = useState<unknown[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => { setActiveMode(effectiveMode); }, [effectiveMode]);

  const loadOrders = async () => {
    if (!isConnected) return;
    setLoadingOrders(true);
    try {
      const res = await fetch("/api/exchange/orders");
      const data = await res.json();
      if (Array.isArray(data)) setOrders(data);
    } finally { setLoadingOrders(false); }
  };

  useEffect(() => { if (isConnected) loadOrders(); }, [isConnected]);

  const handlePlaceOrder = async () => {
    if (!quantity) return;
    if (activeMode === "live" && !confirmLive) return;

    setPlacing(true);
    setOrderResult(null);
    try {
      const res = await fetch("/api/exchange/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          type,
          quantity: Number(quantity),
          price: type === "LIMIT" ? Number(price) : undefined,
          source: "manual",
          confirmLive: activeMode === "live" ? confirmLive : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setOrderResult({ success: true, ...data });
        setQuantity("");
        setPrice("");
        setConfirmLive(false);
        if (isConnected) { loadOrders(); qc.invalidateQueries({ queryKey: getGetExchangeAccountQueryKey() }); }
      } else {
        setOrderResult({ success: false, errors: data.errors, error: data.error });
      }
    } catch {
      setOrderResult({ success: false, error: "下單請求失敗" });
    } finally { setPlacing(false); }
  };

  const mc = MODE_CONFIG[activeMode];

  const availableBalance = account?.balances?.find((b: { asset: string }) => b.asset === "USDT")?.free ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">手動交易</h1>
          <p className="text-xs text-muted-foreground mt-0.5">市價單 / 限價單</p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected
            ? <div className="flex items-center gap-1.5 text-emerald-400 text-xs"><Wifi size={12} /> 已連線</div>
            : <div className="flex items-center gap-1.5 text-muted-foreground text-xs"><WifiOff size={12} /> 未連線</div>}
        </div>
      </div>

      <div className={`p-3 rounded-lg border ${mc.bg} ${mc.border}`}>
        <div className="flex items-center justify-between mb-1">
          <span className={`text-sm font-bold ${mc.color}`}>{mc.label}</span>
          {activeMode === "live" && <AlertTriangle size={16} className="text-red-400" />}
        </div>
        <p className="text-xs text-muted-foreground">{mc.desc}</p>
      </div>

      <div className="flex gap-2">
        <ModeTab mode="paper" active={activeMode === "paper"} onClick={() => setActiveMode("paper")} />
        <ModeTab mode="testnet" active={activeMode === "testnet"} onClick={() => setActiveMode("testnet")} disabled={!isConnected} />
        <ModeTab mode="live" active={activeMode === "live"} onClick={() => setActiveMode("live")} disabled={!tradingEnabled || !isConnected} />
      </div>

      {!isConnected && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-xs text-amber-300">
          <Info size={14} className="flex-shrink-0" />
          測試網和真實交易需要先在「系統設定」完成 API 金鑰設定與連線測試
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">下單面板</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">交易對</label>
              <select value={symbol} onChange={e => setSymbol(e.target.value)}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary">
                {DEMO_PAIRS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">訂單類型</label>
              <div className="flex">
                {(["MARKET", "LIMIT"] as OrderType[]).map(t => (
                  <button key={t} onClick={() => setType(t)}
                    className={`flex-1 py-2 text-xs font-semibold border transition-colors
                      ${t === "MARKET" ? "rounded-l-lg" : "rounded-r-lg border-l-0"}
                      ${type === t ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                    {t === "MARKET" ? "市價" : "限價"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            {(["BUY", "SELL"] as OrderSide[]).map(s => (
              <button key={s} onClick={() => setSide(s)}
                className={`flex-1 py-3 rounded-lg text-sm font-bold border-2 transition-all flex items-center justify-center gap-2
                  ${side === s && s === "BUY" ? "bg-emerald-600 border-emerald-500 text-white" :
                    side === s && s === "SELL" ? "bg-red-600 border-red-500 text-white" :
                    "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
                {s === "BUY" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {s === "BUY" ? "買入 BUY" : "賣出 SELL"}
              </button>
            ))}
          </div>

          {type === "LIMIT" && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">限價（USDT）</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary font-mono" />
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground block mb-1">數量</label>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)}
              placeholder="0.00"
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary font-mono" />
          </div>

          {type === "LIMIT" && quantity && price && (
            <div className="p-2 rounded bg-muted/30 border border-border text-xs text-muted-foreground">
              訂單金額：<span className="text-foreground font-mono">{(Number(quantity) * Number(price)).toFixed(2)} USDT</span>
            </div>
          )}

          {activeMode === "live" && (
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg bg-red-950/30 border border-red-500/30">
              <input type="checkbox" checked={confirmLive} onChange={e => setConfirmLive(e.target.checked)} />
              <span className="text-xs text-red-300">我確認此為真實資金交易，下單後無法撤回（市價單）</span>
            </label>
          )}

          {orderResult && (
            <div className={`p-3 rounded-lg border text-xs space-y-1 ${orderResult.success ? "bg-emerald-950/30 border-emerald-500/30" : "bg-red-950/30 border-red-500/30"}`}>
              {orderResult.success ? (
                <>
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold"><CheckCircle2 size={13} /> {orderResult.message ?? "下單成功"}</div>
                  {orderResult.orderId && <p className="text-muted-foreground">訂單 ID：{orderResult.orderId} | 狀態：{orderResult.status}</p>}
                  {orderResult.warnings?.map((w, i) => (
                    <p key={i} className="text-amber-400 flex items-center gap-1"><AlertCircle size={10} /> {w}</p>
                  ))}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-red-400 font-semibold"><XCircle size={13} /> {orderResult.error ?? "下單失敗"}</div>
                  {orderResult.errors?.map((e, i) => <p key={i} className="text-red-300 ml-4">• {e}</p>)}
                </>
              )}
            </div>
          )}

          <button onClick={handlePlaceOrder}
            disabled={placing || !quantity || (type === "LIMIT" && !price) || (activeMode === "live" && !confirmLive)}
            className={`w-full py-3 rounded-lg text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed
              ${side === "BUY" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}`}>
            {placing ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> 下單中...</span> :
              activeMode === "paper" ? `模擬${side === "BUY" ? "買入" : "賣出"} ${symbol}` :
              activeMode === "live" ? `⚠️ 真實${side === "BUY" ? "買入" : "賣出"} ${symbol}` :
              `測試網${side === "BUY" ? "買入" : "賣出"} ${symbol}`}
          </button>
        </div>

        <div className="space-y-4">
          {isConnected && account && (
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">帳戶餘額</h3>
                <button onClick={() => { refetchAccount(); }} className="text-muted-foreground hover:text-foreground">
                  <RefreshCw size={12} />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{account.networkMode === "mainnet" ? "主網" : "測試網"} · {account.accountType}</p>
              <div className="space-y-1.5">
                {(account.balances ?? []).filter((b: { total: number }) => b.total > 0).slice(0, 8).map((b: { asset: string; free: number; locked: number; total: number }) => (
                  <div key={b.asset} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-mono">{b.asset}</span>
                    <div className="text-right">
                      <p className="font-mono text-foreground">{Number(b.free).toFixed(4)}</p>
                      {b.locked > 0 && <p className="text-muted-foreground/60">鎖定 {Number(b.locked).toFixed(4)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isConnected && (
            <div className="bg-card border border-border rounded-lg p-4 text-center text-xs text-muted-foreground space-y-2">
              <WifiOff size={20} className="mx-auto text-muted-foreground/40" />
              <p>連線後可查看帳戶餘額</p>
            </div>
          )}

          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">下單前檢查項目</h3>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              {[
                "交易對白名單", "最小下單量", "價格精度", "數量精度",
                "餘額充足", "單筆金額上限", "單筆風險上限", "每日虧損上限",
                "最大持倉數", "最大曝險額", "連續虧損次數", "緊急停止狀態",
              ].map((check, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
                  {check}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isConnected && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">未成交訂單</h2>
            <button onClick={loadOrders} disabled={loadingOrders}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {loadingOrders ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              更新
            </button>
          </div>
          {orders.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">目前無未成交訂單</p>
          ) : (
            <div className="space-y-2">
              {(orders as Array<{ orderId: number; symbol: string; side: string; type: string; origQty: number; price: number; status: string; time: string }>).map(o => (
                <div key={o.orderId} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0 text-xs">
                  <div>
                    <span className={`font-semibold ${o.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{o.side}</span>
                    <span className="text-foreground ml-2">{o.symbol}</span>
                    <span className="text-muted-foreground ml-2">{o.type}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-foreground">{o.origQty} @ {o.price}</p>
                    <p className="text-muted-foreground">{o.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-3 rounded-lg bg-muted/20 border border-border text-center">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">⚠️ 免責聲明：</strong>
          本系統不提供任何投資建議。所有交易決定由使用者自行判斷，盈虧自負。
        </p>
      </div>
    </div>
  );
}
