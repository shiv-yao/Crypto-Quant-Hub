import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSettings,
  useGetExchangeStatus,
  getGetExchangeStatusQueryKey,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import {
  ShieldAlert, Lock, Eye, EyeOff, AlertTriangle, Check, Server,
  Key, Wifi, WifiOff, Loader2, ChevronRight, Shield, RefreshCw,
  CheckCircle2, XCircle, AlertCircle, ExternalLink
} from "lucide-react";

const EXCHANGES = ["Binance"];
const NETWORKS = [
  { value: "testnet", label: "Binance 測試網（免費，建議先用）", color: "text-amber-400" },
  { value: "mainnet", label: "Binance 主網（真實資金）", color: "text-red-400" },
];

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: "設定 API 金鑰",
  2: "測試連線",
  3: "確認風控",
  4: "確認啟用",
};

function StepBadge({ step, current }: { step: number; current: number }) {
  const done = current > step;
  const active = current === step;
  return (
    <div className={`flex items-center gap-1.5 ${active ? "text-primary" : done ? "text-emerald-400" : "text-muted-foreground"}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border
        ${active ? "border-primary bg-primary/20" : done ? "border-emerald-400 bg-emerald-400/20" : "border-border bg-card"}`}>
        {done ? <Check size={12} /> : step}
      </div>
      <span className="text-xs hidden sm:block">{STEP_LABELS[step as Step]}</span>
    </div>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const { data: settings } = useGetSettings();
  const { data: exchStatus, refetch: refetchStatus } = useGetExchangeStatus();

  const liveReadyStep = exchStatus?.liveReadyStep ?? 0;
  const isConnected = exchStatus?.isConnected ?? false;
  const apiKeySet = exchStatus?.apiKeySet ?? false;
  const tradingEnabled = exchStatus?.tradingEnabled ?? false;
  const systemMode = exchStatus?.systemMode ?? "paper";

  const [exchange, setExchange] = useState("Binance");
  const [networkMode, setNetworkMode] = useState<"testnet" | "mainnet">("testnet");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [savingKeys, setSavingKeys] = useState(false);
  const [keysSaved, setKeysSaved] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; canTrade?: boolean; usdtBalance?: string } | null>(null);

  const [riskConfirmed, setRiskConfirmed] = useState(false);
  const [liveConfirm, setLiveConfirm] = useState({ riskAgreed: false, noWithdraw: false, text: "" });
  const [enablingLive, setEnablingLive] = useState(false);
  const [disablingLive, setDisablingLive] = useState(false);

  const handleSaveKeys = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) return;
    setSavingKeys(true);
    setKeyError(null);
    try {
      const res = await fetch("/api/exchange/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), networkMode, exchange }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "儲存失敗");
      }
      setKeysSaved(true);
      setApiKey("");
      setApiSecret("");
      setTimeout(() => setKeysSaved(false), 4000);
      qc.invalidateQueries({ queryKey: getGetExchangeStatusQueryKey() });
      qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : "儲存失敗");
    } finally { setSavingKeys(false); }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/exchange/test-connection", { method: "POST" });
      const data = await res.json();
      setTestResult(data);
      qc.invalidateQueries({ queryKey: getGetExchangeStatusQueryKey() });
      refetchStatus();
    } catch {
      setTestResult({ success: false, error: "連線失敗，請確認網路狀態" });
    } finally { setTesting(false); }
  };

  const handleConfirmRisk = () => {
    setRiskConfirmed(true);
  };

  const handleEnableLive = async () => {
    if (!liveConfirm.riskAgreed || !liveConfirm.noWithdraw || liveConfirm.text !== "我了解真實交易的風險，並確認啟用") return;
    setEnablingLive(true);
    try {
      const res = await fetch("/api/exchange/enable-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmText: liveConfirm.text,
          riskAgreed: liveConfirm.riskAgreed,
          noWithdrawConfirmed: liveConfirm.noWithdraw,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "啟用失敗");
      qc.invalidateQueries({ queryKey: getGetExchangeStatusQueryKey() });
      qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      refetchStatus();
    } catch (e) {
      alert(e instanceof Error ? e.message : "啟用失敗");
    } finally { setEnablingLive(false); }
  };

  const handleDisableLive = async () => {
    if (!window.confirm("確定要停用真實交易，切回模擬模式？")) return;
    setDisablingLive(true);
    try {
      await fetch("/api/exchange/disable-live", { method: "POST" });
      qc.invalidateQueries({ queryKey: getGetExchangeStatusQueryKey() });
      qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      refetchStatus();
    } finally { setDisablingLive(false); }
  };

  const currentStep = Math.min(liveReadyStep + 1, 4) as Step;

  const modeLabel = systemMode === "live"
    ? networkMode === "mainnet" ? "真實交易" : "測試網交易"
    : "模擬模式";

  const modeBg = systemMode === "live"
    ? "border-red-500/60 bg-red-950/30"
    : "border-primary/40 bg-primary/10";

  const modeColor = systemMode === "live" ? "text-red-400" : "text-primary";

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">系統設定</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Binance 交易所連線與安全設定</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${modeBg}`}>
          <span className={`w-2 h-2 rounded-full ${systemMode === "live" ? "bg-red-400 animate-pulse" : "bg-primary animate-pulse"}`} />
          <span className={`text-xs font-semibold ${modeColor}`}>{modeLabel}</span>
        </div>
      </div>

      {systemMode === "live" && (
        <div className="bg-red-950/50 border-2 border-red-500/60 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-400 mb-1">⚠️ 真實交易模式已啟用</p>
            <p className="text-xs text-red-300 leading-relaxed">
              所有訂單將使用真實資金。本系統不提供任何投資建議，所有交易風險由使用者自行承擔。
            </p>
            <button onClick={handleDisableLive} disabled={disablingLive}
              className="mt-3 px-3 py-1.5 rounded bg-red-500/20 border border-red-500/50 text-red-400 text-xs hover:bg-red-500/30 transition-colors">
              {disablingLive ? "切換中..." : "停用真實交易，切回模擬模式"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-amber-950/30 border border-amber-500/40 rounded-lg p-3 flex items-start gap-3">
        <Shield size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-amber-400 mb-0.5">API 金鑰安全提示</p>
          <p className="text-xs text-amber-300/80 leading-relaxed">
            請在 Binance 建立<strong>僅具現貨交易權限</strong>、<strong>禁止提幣</strong>的 API 金鑰。
            金鑰僅透過加密後儲存於伺服器，不會回傳至瀏覽器、不寫入日誌。
          </p>
          <a href="https://www.binance.com/zh-TC/my/settings/api-management" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 mt-1">
            前往 Binance API 管理 <ExternalLink size={10} />
          </a>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {([1, 2, 3, 4] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <StepBadge step={s} current={currentStep} />
            {i < 3 && <ChevronRight size={14} className="text-border flex-shrink-0" />}
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Key size={14} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">第一步：設定 API 金鑰</h2>
          {apiKeySet && <CheckCircle2 size={14} className="ml-auto text-emerald-400" />}
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">交易所</label>
          <select value={exchange} onChange={e => setExchange(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary">
            {EXCHANGES.map(ex => <option key={ex}>{ex}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">網路模式</label>
          <div className="space-y-2">
            {NETWORKS.map(n => (
              <label key={n.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                ${networkMode === n.value ? "border-primary bg-primary/10" : "border-border hover:border-border/80"}`}>
                <input type="radio" value={n.value} checked={networkMode === n.value}
                  onChange={() => setNetworkMode(n.value as "testnet" | "mainnet")}
                  className="mt-0.5" />
                <div>
                  <p className={`text-xs font-semibold ${n.color}`}>{n.label}</p>
                  {n.value === "testnet" && <p className="text-xs text-muted-foreground mt-0.5">測試網 API 金鑰請在 testnet.binance.vision 申請</p>}
                  {n.value === "mainnet" && <p className="text-xs text-muted-foreground mt-0.5">⚠️ 主網金鑰將用於真實資金交易</p>}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">API Key</label>
          <div className="relative">
            <input type={showKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder={apiKeySet ? "金鑰已設定（輸入新金鑰可覆蓋）" : "輸入 Binance API Key"}
              className="w-full bg-background border border-border rounded px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary font-mono" />
            <button type="button" onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">API Secret</label>
          <div className="relative">
            <input type={showSecret ? "text" : "password"} value={apiSecret} onChange={e => setApiSecret(e.target.value)}
              placeholder={apiKeySet ? "Secret 已設定（輸入新值可覆蓋）" : "輸入 Binance API Secret"}
              className="w-full bg-background border border-border rounded px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary font-mono" />
            <button type="button" onClick={() => setShowSecret(!showSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">金鑰加密後儲存於伺服器，不會傳回瀏覽器</p>
        </div>

        {keyError && (
          <div className="flex items-center gap-2 p-2 rounded bg-red-950/30 border border-red-500/30 text-xs text-red-400">
            <XCircle size={12} /> {keyError}
          </div>
        )}

        <button onClick={handleSaveKeys} disabled={savingKeys || (!apiKey && !apiSecret)}
          className="flex items-center gap-2 px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
          {savingKeys ? <><Loader2 size={13} className="animate-spin" /> 儲存中...</> :
            keysSaved ? <><Check size={13} /> 金鑰已安全儲存</> : "儲存 API 金鑰"}
        </button>
      </div>

      <div className={`bg-card border rounded-lg p-5 space-y-4 transition-opacity ${liveReadyStep < 1 ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Wifi size={14} className={isConnected ? "text-emerald-400" : "text-muted-foreground"} />
          <h2 className="text-sm font-semibold text-foreground">第二步：測試連線</h2>
          {isConnected && <CheckCircle2 size={14} className="ml-auto text-emerald-400" />}
        </div>

        {testResult && (
          <div className={`p-3 rounded-lg border text-xs space-y-1 ${testResult.success ? "bg-emerald-950/30 border-emerald-500/30" : "bg-red-950/30 border-red-500/30"}`}>
            {testResult.success ? (
              <>
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold"><CheckCircle2 size={13} /> 連線成功</div>
                <p className="text-muted-foreground">帳戶類型：{testResult.canTrade ? "可交易" : "不可交易"}</p>
                <p className="text-muted-foreground">USDT 餘額：{testResult.usdtBalance} USDT</p>
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-red-400"><XCircle size={13} /> {testResult.error}</div>
            )}
          </div>
        )}

        {exchStatus?.connectionError && !testResult && (
          <div className="flex items-center gap-2 p-2 rounded bg-red-950/30 border border-red-500/30 text-xs text-red-400">
            <AlertCircle size={12} /> 上次連線錯誤：{exchStatus.connectionError}
          </div>
        )}

        <button onClick={handleTestConnection} disabled={testing || !apiKeySet}
          className="flex items-center gap-2 px-4 py-2 rounded bg-card border border-border text-sm text-foreground hover:bg-muted/30 disabled:opacity-50 transition-colors">
          {testing ? <><Loader2 size={13} className="animate-spin" /> 測試中...</> :
            <><RefreshCw size={13} /> 測試連線</>}
        </button>
      </div>

      <div className={`bg-card border rounded-lg p-5 space-y-4 transition-opacity ${liveReadyStep < 2 ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <ShieldAlert size={14} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">第三步：確認風控設定</h2>
          {(liveReadyStep >= 3 || riskConfirmed) && <CheckCircle2 size={14} className="ml-auto text-emerald-400" />}
        </div>

        <div className="space-y-2 text-xs text-muted-foreground">
          <p>請確認已在<strong className="text-foreground">「風控管理」</strong>頁面設定適合您的風險參數，包括：</p>
          <ul className="space-y-1 ml-3">
            <li className="flex items-center gap-1.5"><Check size={10} className="text-emerald-400" /> 最大單筆金額（USDT）</li>
            <li className="flex items-center gap-1.5"><Check size={10} className="text-emerald-400" /> 每日虧損上限（%）</li>
            <li className="flex items-center gap-1.5"><Check size={10} className="text-emerald-400" /> 最大持倉數量</li>
            <li className="flex items-center gap-1.5"><Check size={10} className="text-emerald-400" /> 交易對白名單</li>
            <li className="flex items-center gap-1.5"><Check size={10} className="text-emerald-400" /> 連續虧損暫停次數</li>
          </ul>
        </div>

        <button onClick={handleConfirmRisk} disabled={liveReadyStep < 2}
          className="flex items-center gap-2 px-4 py-2 rounded bg-card border border-border text-sm text-foreground hover:bg-muted/30 disabled:opacity-50 transition-colors">
          <Check size={13} /> 已確認風控設定
        </button>
      </div>

      <div className={`bg-card border rounded-lg p-5 space-y-4 transition-opacity ${(liveReadyStep < 3 && !riskConfirmed) ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Lock size={14} className="text-red-400" />
          <h2 className="text-sm font-semibold text-foreground">第四步：啟用交易</h2>
          {tradingEnabled && <span className="ml-auto px-2 py-0.5 rounded text-xs bg-red-500/15 text-red-400 border border-red-500/30">已啟用</span>}
        </div>

        {!tradingEnabled ? (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-red-950/30 border border-red-500/30 text-xs text-red-300 space-y-1">
              <p className="font-semibold text-red-400">⚠️ 啟用前請仔細閱讀：</p>
              <p>• 真實交易將使用您帳戶中的實際資金</p>
              <p>• 請確保 API 金鑰無提幣權限</p>
              <p>• 本系統不提供任何投資建議，虧損風險自行承擔</p>
              <p>• 建議先在測試網充分驗證策略後再使用主網</p>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={liveConfirm.riskAgreed} onChange={e => setLiveConfirm(p => ({ ...p, riskAgreed: e.target.checked }))} />
              <span className="text-xs text-foreground">我了解加密貨幣交易風險，並同意自行承擔所有損益</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={liveConfirm.noWithdraw} onChange={e => setLiveConfirm(p => ({ ...p, noWithdraw: e.target.checked }))} />
              <span className="text-xs text-foreground">我確認已建立<strong>僅交易、無提幣權限</strong>的 API 金鑰</span>
            </label>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                請輸入確認文字：<span className="text-foreground font-mono">我了解真實交易的風險，並確認啟用</span>
              </label>
              <input type="text" value={liveConfirm.text}
                onChange={e => setLiveConfirm(p => ({ ...p, text: e.target.value }))}
                placeholder="輸入上方文字以確認..."
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-red-500 font-mono text-xs" />
            </div>

            <button onClick={handleEnableLive}
              disabled={enablingLive || !liveConfirm.riskAgreed || !liveConfirm.noWithdraw || liveConfirm.text !== "我了解真實交易的風險，並確認啟用"}
              className="w-full py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {enablingLive ? <span className="flex items-center justify-center gap-2"><Loader2 size={13} className="animate-spin" /> 啟用中...</span> : "啟用交易"}
            </button>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-red-950/30 border border-red-500/40 flex items-center gap-3">
            <AlertTriangle size={16} className="text-red-400" />
            <div>
              <p className="text-xs font-semibold text-red-400">真實交易已啟用</p>
              <p className="text-xs text-muted-foreground">所有訂單將使用真實資金</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 rounded-lg bg-muted/20 border border-border">
        <p className="text-xs text-muted-foreground leading-relaxed text-center">
          <strong className="text-foreground">免責聲明：</strong>
          本系統僅供研究、學習與模擬用途。所有分析結果、策略建議與模擬績效均不構成任何投資建議。
          加密貨幣市場波動極大，請充分了解風險並謹慎評估。
        </p>
      </div>
    </div>
  );
}
