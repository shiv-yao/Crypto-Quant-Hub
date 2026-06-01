import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Strategies from "@/pages/strategies";
import NewStrategy from "@/pages/new-strategy";
import Backtests from "@/pages/backtests";
import BacktestDetail from "@/pages/backtest-detail";
import PaperTrading from "@/pages/paper-trading";
import Risk from "@/pages/risk";
import Trades from "@/pages/trades";
import Settings from "@/pages/settings";
import Trading from "@/pages/trading";
import Bitget from "@/pages/bitget";
import Okx from "@/pages/okx";
import AutoTrading from "@/pages/auto-trading";
import OkxSwapAi from "@/pages/okx-swap-ai";
import OkxShadowLearning from "@/pages/okx-shadow-learning";
import AuditLogs from "@/pages/audit-logs";
import {
  LayoutDashboard, Layers, BarChart2, Activity, ShieldAlert, List,
  Settings as SettingsIcon, Menu, X, TrendingUp, CandlestickChart, FileText,
  AlertTriangle, Wifi, Radio, Bot, Microscope
} from "lucide-react";
import { useState } from "react";
import { useGetExchangeStatus } from "@workspace/api-client-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

const NAV_ITEMS = [
  { path: "/", label: "儀表板", icon: LayoutDashboard },
  { path: "/auto-trading", label: "自動交易", icon: Bot },
  { path: "/okx-swap-ai", label: "OKX 合約 AI", icon: Bot },
  { path: "/okx-shadow-learning", label: "影子學習", icon: Microscope },
  { path: "/strategies", label: "策略管理", icon: Layers },
  { path: "/backtests", label: "回測", icon: BarChart2 },
  { path: "/paper-trading", label: "模擬交易", icon: Activity },
  { path: "/trading", label: "手動交易", icon: CandlestickChart },
  { path: "/bitget", label: "Bitget API", icon: Radio },
  { path: "/okx", label: "OKX API", icon: Radio },
  { path: "/risk", label: "風險管理", icon: ShieldAlert },
  { path: "/trades", label: "交易紀錄", icon: List },
  { path: "/audit-logs", label: "稽核紀錄", icon: FileText },
  { path: "/settings", label: "系統設定", icon: SettingsIcon },
];

function ModeStatusBar() {
  const { data: status } = useGetExchangeStatus();
  const isLive = status?.systemMode === "live" && status?.tradingEnabled;
  const isConnected = status?.isConnected ?? false;

  if (!status) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 text-xs font-medium text-primary">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        模擬模式
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-medium
      ${isLive ? "bg-red-500/10 border-red-500/40 text-red-400" : "bg-primary/10 border-primary/40 text-primary"}`}>
      {isConnected
        ? <Wifi size={11} className={isLive ? "text-red-400" : "text-primary"} />
        : <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-red-400" : "bg-primary"} animate-pulse`} />}
      <span>
        {isLive ? "⚠️ 真實交易"
          : isConnected ? `${status.networkMode === "mainnet" ? "主網" : "測試網"}已連線`
          : "模擬模式"}
      </span>
    </div>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [location] = useLocation();
  const { data: status } = useGetExchangeStatus();
  const isLive = status?.systemMode === "live" && status?.tradingEnabled;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed top-0 left-0 h-full z-30 w-60 bg-card border-r border-border flex flex-col transition-transform duration-200
        lg:static lg:translate-x-0
        ${open ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary/20 border border-primary/40 flex items-center justify-center">
              <TrendingUp size={13} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">QuantSys</p>
              <p className={`text-xs leading-tight ${isLive ? "text-red-400" : "text-primary"}`}>
                {isLive ? "⚠️ 真實交易" : "模擬模式"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const isActive = path === "/" ? location === "/" : location.startsWith(path);
            const isTrading = path === "/trading";
            return (
              <Link key={path} href={path}>
                <div
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                    isActive
                      ? isTrading && isLive
                        ? "bg-red-500/15 text-red-400 border border-red-500/25"
                        : "bg-primary/15 text-primary border border-primary/25"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                  {isTrading && isLive && (
                    <AlertTriangle size={11} className="ml-auto text-red-400" />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          {isLive ? (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-xs text-red-400 leading-relaxed font-semibold">⚠️ 真實交易模式</p>
              <p className="text-xs text-red-300/80 leading-relaxed">所有訂單使用真實資金</p>
            </div>
          ) : (
            <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-400 leading-relaxed">行情使用真實公開數據；下單預設為 Demo Trading</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="dark min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-10 border-b border-border bg-card/80 flex items-center px-4 gap-3 flex-shrink-0">
        <button
          className="lg:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setSidebarOpen(true)}
          data-testid="button-open-sidebar"
        >
          <Menu size={16} />
        </button>
        <div className="flex-1 text-xs text-muted-foreground font-mono">
          加密貨幣量化交易研究平台
        </div>
        <ModeStatusBar />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-auto min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/auto-trading" component={AutoTrading} />
        <Route path="/okx-swap-ai" component={OkxSwapAi} />
        <Route path="/okx-shadow-learning" component={OkxShadowLearning} />
        <Route path="/strategies/new" component={NewStrategy} />
        <Route path="/strategies" component={Strategies} />
        <Route path="/backtests/:id" component={BacktestDetail} />
        <Route path="/backtests" component={Backtests} />
        <Route path="/paper-trading" component={PaperTrading} />
        <Route path="/trading" component={Trading} />
        <Route path="/bitget" component={Bitget} />
        <Route path="/okx" component={Okx} />
        <Route path="/risk" component={Risk} />
        <Route path="/trades" component={Trades} />
        <Route path="/audit-logs" component={AuditLogs} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
