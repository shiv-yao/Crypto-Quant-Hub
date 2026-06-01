import { useListAuditLogs } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Shield, List } from "lucide-react";
import { getListAuditLogsQueryKey } from "@workspace/api-client-react";

const ACTION_LABELS: Record<string, string> = {
  api_key_saved: "儲存 API 金鑰",
  connection_test: "測試連線",
  live_trading_enabled: "啟用真實交易",
  live_trading_disabled: "停用真實交易",
  order_validation: "下單前檢查",
  order_placed: "下單",
  order_cancelled: "取消訂單",
  risk_settings_updated: "更新風控設定",
  emergency_stop: "緊急停止",
};

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  paper: { label: "模擬", color: "text-primary bg-primary/10" },
  testnet: { label: "測試網", color: "text-amber-400 bg-amber-400/10" },
  live: { label: "真實", color: "text-red-400 bg-red-400/10" },
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "手動",
  strategy: "策略",
};

export default function AuditLogs() {
  const qc = useQueryClient();
  const { data: logs, isLoading, refetch } = useListAuditLogs({ limit: 100 });

  const rows = logs ?? [];

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">稽核紀錄</h1>
          <p className="text-xs text-muted-foreground mt-0.5">所有系統操作與交易紀錄</p>
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-card border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw size={12} />
          更新
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">載入中...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <List size={24} className="mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">尚無稽核紀錄</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((log) => {
              const modeInfo = MODE_LABELS[log.mode] ?? { label: log.mode, color: "text-muted-foreground bg-muted" };
              const actionLabel = ACTION_LABELS[log.action] ?? log.action;
              const isSuccess = log.result === "success";
              const isError = log.result === "error";
              const isRejected = log.result === "rejected";

              return (
                <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-muted/20 transition-colors">
                  <div className="mt-0.5 flex-shrink-0">
                    {isSuccess && <CheckCircle2 size={14} className="text-emerald-400" />}
                    {isError && <XCircle size={14} className="text-red-400" />}
                    {isRejected && <AlertCircle size={14} className="text-amber-400" />}
                    {!isSuccess && !isError && !isRejected && <Shield size={14} className="text-muted-foreground" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{actionLabel}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${modeInfo.color}`}>{modeInfo.label}</span>
                      {log.source && <span className="text-xs text-muted-foreground">{SOURCE_LABELS[log.source] ?? log.source}</span>}
                    </div>

                    {log.errorMessage && (
                      <p className="text-xs text-red-400 mt-1">{log.errorMessage}</p>
                    )}

                    {log.details && Object.keys(log.details as object).length > 0 && (
                      <div className="mt-1.5 text-xs text-muted-foreground font-mono bg-background/50 rounded px-2 py-1 max-w-full overflow-x-auto">
                        {Object.entries(log.details as Record<string, unknown>)
                          .filter(([k]) => !["errors", "warnings"].includes(k))
                          .map(([k, v]) => (
                            <span key={k} className="mr-3">
                              <span className="text-muted-foreground/70">{k}:</span>{" "}
                              <span className="text-foreground">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("zh-TW", {
                        month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit", second: "2-digit"
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
