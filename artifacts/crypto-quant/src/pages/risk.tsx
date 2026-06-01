import { useState } from "react";
import {
  useGetRiskSettings, useUpdateRiskSettings, useTriggerEmergencyStop, getGetRiskSettingsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, AlertTriangle, Check, X } from "lucide-react";

const DEMO_RISK = {
  id: 1, maxPositionSizePct: 5, maxDailyLossPct: 3, maxLeverage: 1, maxOpenPositions: 5,
  stopLossPct: 2, takeProfitPct: 6, trailingStopPct: 1.5, trailingStopEnabled: false,
  emergencyStopEnabled: false, updatedAt: new Date().toISOString(),
};

function NumField({ label, sub, value, onChange, min, max, step, testId }: {
  label: string; sub?: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; testId: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-foreground block">{label}</label>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      <div className="flex items-center gap-2">
        <input type="number" min={min} max={max} step={step ?? 0.1} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary font-mono"
          data-testid={`input-risk-${testId}`} />
      </div>
    </div>
  );
}

export default function Risk() {
  const { data: riskData } = useGetRiskSettings();
  const updateRisk = useUpdateRiskSettings();
  const emergencyStop = useTriggerEmergencyStop();
  const qc = useQueryClient();

  const r = riskData ?? DEMO_RISK;

  const [form, setForm] = useState({
    maxPositionSizePct: r.maxPositionSizePct,
    maxDailyLossPct: r.maxDailyLossPct,
    maxLeverage: r.maxLeverage,
    maxOpenPositions: r.maxOpenPositions,
    stopLossPct: r.stopLossPct,
    takeProfitPct: r.takeProfitPct,
    trailingStopPct: r.trailingStopPct,
    trailingStopEnabled: r.trailingStopEnabled,
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [emergencyConfirm, setEmergencyConfirm] = useState(false);
  const [emergencyStopped, setEmergencyStopped] = useState(false);

  const set = (key: string, val: number | boolean) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateRisk.mutateAsync({ data: form });
      qc.invalidateQueries({ queryKey: getGetRiskSettingsQueryKey() });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { } finally { setSaving(false); }
  };

  const handleEmergencyStop = async () => {
    if (!emergencyConfirm) { setEmergencyConfirm(true); return; }
    try {
      await emergencyStop.mutateAsync({});
      setEmergencyStopped(true);
      setEmergencyConfirm(false);
    } catch { }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">風險管理</h1>
        <p className="text-xs text-muted-foreground mt-0.5">設定交易風控參數，保護模擬資金</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-5">
        <h2 className="text-sm font-semibold text-foreground border-b border-border pb-3">部位與資金限制</h2>
        <div className="grid grid-cols-2 gap-5">
          <NumField label="單筆風險上限 (%)" sub="每筆交易最大虧損佔總資金比例" value={form.maxPositionSizePct} onChange={v => set("maxPositionSizePct", v)} min={0.1} max={50} testId="maxPositionSizePct" />
          <NumField label="每日虧損上限 (%)" sub="觸發後暫停當日所有策略" value={form.maxDailyLossPct} onChange={v => set("maxDailyLossPct", v)} min={0.1} max={20} testId="maxDailyLossPct" />
          <NumField label="最大槓桿" sub="1 = 無槓桿，最高建議 3x" value={form.maxLeverage} onChange={v => set("maxLeverage", v)} min={1} max={10} step={0.5} testId="maxLeverage" />
          <NumField label="最大同時持倉數" sub="超過此數量拒絕新建倉" value={form.maxOpenPositions} onChange={v => set("maxOpenPositions", Math.round(v))} min={1} max={20} step={1} testId="maxOpenPositions" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-5">
        <h2 className="text-sm font-semibold text-foreground border-b border-border pb-3">停損停利設定</h2>
        <div className="grid grid-cols-2 gap-5">
          <NumField label="停損 (%)" sub="持倉虧損達此比例自動平倉" value={form.stopLossPct} onChange={v => set("stopLossPct", v)} min={0.1} max={50} testId="stopLossPct" />
          <NumField label="停利 (%)" sub="持倉獲利達此比例自動平倉" value={form.takeProfitPct} onChange={v => set("takeProfitPct", v)} min={0.1} max={100} testId="takeProfitPct" />
        </div>

        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-foreground">移動停損</p>
              <p className="text-xs text-muted-foreground">價格回撤達設定比例時自動停損</p>
            </div>
            <button
              onClick={() => set("trailingStopEnabled", !form.trailingStopEnabled)}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.trailingStopEnabled ? "bg-primary" : "bg-muted"}`}
              data-testid="toggle-trailing-stop"
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.trailingStopEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          {form.trailingStopEnabled && (
            <NumField label="移動停損幅度 (%)" value={form.trailingStopPct} onChange={v => set("trailingStopPct", v)} min={0.1} max={20} testId="trailingStopPct" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          data-testid="button-save-risk">
          {saving ? "儲存中..." : saved ? <><Check size={13} />已儲存</> : "儲存設定"}
        </button>
        {saved && <p className="text-xs text-emerald-400">風控設定已更新</p>}
      </div>

      <div className="bg-red-950/40 border border-red-500/40 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-red-400" />
          <h2 className="text-sm font-semibold text-red-400">緊急停止</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          觸發緊急停止將立即暫停所有正在執行的策略，不再發送任何新訂單。此操作不可自動恢復，需手動重新啟動各策略。
        </p>

        {emergencyStopped ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/40">
            <ShieldAlert size={14} className="text-red-400" />
            <p className="text-sm font-semibold text-red-400">緊急停止已觸發 — 所有策略已暫停</p>
          </div>
        ) : emergencyConfirm ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/15 border border-red-500/40">
              <AlertTriangle size={13} className="text-red-400" />
              <p className="text-xs text-red-300 font-medium">確認要停止所有策略嗎？此操作無法自動復原。</p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleEmergencyStop}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition-colors"
                data-testid="button-emergency-confirm">
                <ShieldAlert size={12} />
                確認緊急停止
              </button>
              <button onClick={() => setEmergencyConfirm(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors"
                data-testid="button-emergency-cancel">
                <X size={12} />
                取消
              </button>
            </div>
          </div>
        ) : (
          <button onClick={handleEmergencyStop}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-500 transition-colors"
            data-testid="button-emergency-stop">
            <ShieldAlert size={14} />
            緊急停止所有策略
          </button>
        )}
      </div>
    </div>
  );
}
