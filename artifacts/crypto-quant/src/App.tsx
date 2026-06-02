import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import OkxSwapAi from "@/pages/okx-swap-ai";
import OkxShadowLearning from "@/pages/okx-shadow-learning";
import { Menu, X, TrendingUp, Bot, Microscope, ShieldCheck } from "lucide-react";
import { useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

const NAV_ITEMS = [
  { path: "/", label: "OKX 合約 AI", icon: Bot },
  { path: "/okx-shadow-learning", label: "影子學習", icon: Microscope },
];

function ModeStatusBar() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
      <ShieldCheck size={11} />
      OKX 合約 Demo
    </div>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [location] = useLocation();

  return (
    <>
      {open && <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={onClose} />}
      <aside className={`fixed left-0 top-0 z-30 flex h-full w-60 flex-col border-r border-border bg-card transition-transform duration-200 lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/40 bg-primary/20">
              <TrendingUp size={13} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-foreground">OKX Swap AI</p>
              <p className="text-xs leading-tight text-emerald-400">合約 Demo 專用版</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground lg:hidden">
            <X size={14} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const isActive = path === "/" ? location === "/" : location.startsWith(path);
            return (
              <Link key={path} href={path}>
                <div onClick={onClose} className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "border border-primary/25 bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                  <Icon size={14} />
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
            <p className="text-xs font-semibold leading-relaxed text-emerald-400">OKX USDT 永續合約</p>
            <p className="text-xs leading-relaxed text-emerald-300/80">Demo Trading · AI 動態風控 · 影子學習</p>
          </div>
        </div>
      </aside>
    </>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="dark flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-10 flex-shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4">
        <button className="text-muted-foreground hover:text-foreground lg:hidden" onClick={() => setSidebarOpen(true)} data-testid="button-open-sidebar">
          <Menu size={16} />
        </button>
        <div className="flex-1 text-xs font-mono text-muted-foreground">OKX 全幣種合約 AI 系統</div>
        <ModeStatusBar />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={OkxSwapAi} />
        <Route path="/okx-shadow-learning" component={OkxShadowLearning} />
        <Route component={OkxSwapAi} />
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
