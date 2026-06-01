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
import {
  LayoutDashboard, Layers, BarChart2, Activity, ShieldAlert, List, Settings as SettingsIcon,
  Menu, X, TrendingUp
} from "lucide-react";
import { useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

const NAV_ITEMS = [
  { path: "/", label: "儀表板", icon: LayoutDashboard },
  { path: "/strategies", label: "策略管理", icon: Layers },
  { path: "/backtests", label: "回測", icon: BarChart2 },
  { path: "/paper-trading", label: "模擬交易", icon: Activity },
  { path: "/risk", label: "風險管理", icon: ShieldAlert },
  { path: "/trades", label: "交易紀錄", icon: List },
  { path: "/settings", label: "系統設定", icon: SettingsIcon },
];

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [location] = useLocation();

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
              <p className="text-xs text-primary leading-tight">模擬模式</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-muted-foreground hover:text-foreground" data-testid="button-close-sidebar">
            <X size={14} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const isActive = path === "/" ? location === "/" : location.startsWith(path);
            return (
              <Link key={path} href={path}>
                <div
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                    isActive
                      ? "bg-primary/15 text-primary border border-primary/25"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  data-testid={`nav-${path.replace("/", "") || "home"}`}
                >
                  <Icon size={14} />
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-400 leading-relaxed">本系統僅供研究與模擬，不構成投資建議</p>
          </div>
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
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-medium text-primary">模擬模式</span>
        </div>
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
        <Route path="/strategies/new" component={NewStrategy} />
        <Route path="/strategies" component={Strategies} />
        <Route path="/backtests/:id" component={BacktestDetail} />
        <Route path="/backtests" component={Backtests} />
        <Route path="/paper-trading" component={PaperTrading} />
        <Route path="/risk" component={Risk} />
        <Route path="/trades" component={Trades} />
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
