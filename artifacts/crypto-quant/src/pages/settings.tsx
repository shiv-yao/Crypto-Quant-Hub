import { useState } from "react";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Lock, Eye, EyeOff, AlertTriangle, Check, Server, Key } from "lucide-react";

const DEMO_SETTINGS = { id: 1, mode: "paper" as const, exchangeName: "Binance", apiKeySet: false, tradingEnabled: false, updatedAt: new Date().toISOString() };
const EXCHANGES = ["Binance", "OKX", "Bybit", "Kraken", "Coinbase Pro"];

export default function Settings() {
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const qc = useQueryClient();

  const s = settings ?? DEMO_SETTINGS;

  const [exchange, setExchange] = useState(s.exchangeName);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings.mutateAsync({ data: { exchangeName: exchange } });
      qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">系統設定</h1>
        <p className="text-xs text-muted-foreground mt-0.5">交易所連接與系統模式設定</p>
      </div>

      <div className="bg-red-950/40 border border-red-500/40 rounded-lg p-4 flex items-start gap-3">
        <ShieldAlert size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-red-400 mb-1">⚠️ 安全警告</p>
          <p className="text-xs text-red-300 leading-relaxed">
            API 金鑰請勿在前端瀏覽器環境儲存或暴露。若需連接交易所，金鑰應儲存於後端伺服器的環境變數中，並透過安全 API 進行存取。
            本系統目前僅支援唯讀市場資料與模擬交易模式。<strong>真實交易功能目前停用。</strong>
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Server size={14} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">系統模式</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className={`p-4 rounded-lg border-2 cursor-pointer ${s.mode === "paper" ? "border-primary bg-primary/10" : "border-border"}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-foreground">模擬模式</p>
              {s.mode === "paper" && <span className="w-2 h-2 rounded-full bg-primary" />}
            </div>
            <p className="text-xs text-muted-foreground">使用示範資料進行策略研究與回測，無須 API 金鑰，不涉及真實資金。</p>
          </div>
          <div className={`p-4 rounded-lg border-2 relative ${s.mode === "live" ? "border-primary bg-primary/10" : "border-border opacity-60"}`}>
            <div className="absolute top-2 right-2">
              <Lock size={12} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-2">實盤模式</p>
            <p className="text-xs text-muted-foreground">連接真實交易所帳戶。需完成所有安全設定後才可啟用。</p>
            <div className="mt-3 px-2 py-1 rounded bg-muted/50 border border-border">
              <p className="text-xs text-muted-foreground text-center">停用</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Key size={14} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">交易所設定</h2>
          <span className="ml-auto px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30">唯讀市場資料 / 模擬模式</span>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">交易所</label>
          <select value={exchange} onChange={e => setExchange(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            data-testid="select-exchange">
            {EXCHANGES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            API Key
            <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">僅供顯示，不儲存</span>
          </label>
          <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="僅限模擬模式下查看公開市場資料用"
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary font-mono"
            data-testid="input-api-key" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            API Secret
            <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-red-500/15 text-red-400">請勿在此填入真實金鑰</span>
          </label>
          <div className="relative">
            <input type={showSecret ? "text" : "password"} value={apiSecret} onChange={e => setApiSecret(e.target.value)}
              placeholder="❌ 請勿在前端輸入真實 API Secret"
              className="w-full bg-background border border-red-500/40 rounded px-3 py-2 pr-10 text-sm text-foreground placeholder:text-red-400/60 focus:outline-none focus:border-red-500 font-mono"
              data-testid="input-api-secret" />
            <button type="button" onClick={() => setShowSecret(!showSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              data-testid="button-toggle-secret">
              {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <p className="text-xs text-red-400/80 mt-1 flex items-center gap-1">
            <AlertTriangle size={10} />
            真實金鑰請儲存於伺服器端環境變數，不應出現在瀏覽器
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <ShieldAlert size={14} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">真實交易</h2>
          <span className="ml-auto px-2 py-0.5 rounded text-xs bg-red-500/15 text-red-400 border border-red-500/30">功能停用</span>
        </div>

        <div className="space-y-3 opacity-60 pointer-events-none select-none">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
            <div className="w-3 h-3 rounded border-2 border-border" />
            <p className="text-xs text-foreground">已完成 API 金鑰安全設定</p>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
            <div className="w-3 h-3 rounded border-2 border-border" />
            <p className="text-xs text-foreground">已閱讀並同意風險聲明</p>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
            <div className="w-3 h-3 rounded border-2 border-border" />
            <p className="text-xs text-foreground">已啟用雙重驗證 (2FA)</p>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
          <p className="text-xs text-muted-foreground">啟用真實交易</p>
          <div className="flex items-center gap-2">
            <Lock size={11} className="text-muted-foreground" />
            <div className="w-9 h-5 rounded-full bg-muted border border-border relative opacity-50 cursor-not-allowed">
              <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-muted-foreground/50" />
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          真實交易功能需完成上方所有安全設定步驟後方可考慮啟用。本系統強烈建議在充分回測與模擬交易驗證後再考慮實盤操作。
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          data-testid="button-save-settings">
          {saving ? "儲存中..." : saved ? <><Check size={13} />已儲存</> : "儲存設定"}
        </button>
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
