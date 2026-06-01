export type SkillStatus = "enabled" | "disabled";

export interface OkxSwapSkillDefinition {
  id: string;
  name: string;
  description: string;
  category: "market" | "ai" | "risk" | "execution" | "position";
  status: SkillStatus;
  version: string;
}

const skills = new Map<string, OkxSwapSkillDefinition>([
  ["okx.swap.universe", {
    id: "okx.swap.universe",
    name: "OKX 全幣種合約探索",
    description: "動態讀取 OKX USDT 永續合約，依 24h 成交量分批掃描。",
    category: "market",
    status: "enabled",
    version: "1.0.0",
  }],
  ["okx.swap.ai-score", {
    id: "okx.swap.ai-score",
    name: "OKX 合約 AI 多因子評分",
    description: "使用 EMA、RSI、ATR、動能與量能產生 LONG、SHORT 或 HOLD 可解釋訊號。",
    category: "ai",
    status: "enabled",
    version: "1.0.0",
  }],
  ["okx.swap.adaptive-risk", {
    id: "okx.swap.adaptive-risk",
    name: "OKX AI 自適應參數",
    description: "依波動、趨勢、量能與信心動態計算倉位、槓桿、止盈、止損、追蹤停利與最大持倉時間。",
    category: "risk",
    status: "enabled",
    version: "1.0.0",
  }],
  ["okx.swap.risk-guard", {
    id: "okx.swap.risk-guard",
    name: "OKX 合約風控閘門",
    description: "限制槓桿、單筆名目價值、最大持倉數、最大總曝險與停損停利。",
    category: "risk",
    status: "enabled",
    version: "1.0.0",
  }],
  ["okx.swap.demo-executor", {
    id: "okx.swap.demo-executor",
    name: "OKX Demo 合約執行器",
    description: "僅允許 OKX Demo Trading；主網環境會拒絕自動下單。",
    category: "execution",
    status: "enabled",
    version: "1.0.0",
  }],
  ["okx.swap.position-manager", {
    id: "okx.swap.position-manager",
    name: "OKX 合約持倉管理",
    description: "更新未實現損益，依動態停損、動態停利、追蹤停利、最大持倉時間與反向 AI 訊號管理平倉。",
    category: "position",
    status: "enabled",
    version: "1.0.0",
  }],
]);

export function listOkxSwapSkills(): OkxSwapSkillDefinition[] {
  return Array.from(skills.values());
}

export function isOkxSwapSkillEnabled(id: string): boolean {
  return skills.get(id)?.status === "enabled";
}

export function setOkxSwapSkillStatus(id: string, status: SkillStatus): OkxSwapSkillDefinition {
  const skill = skills.get(id);
  if (!skill) throw new Error(`找不到 OKX Skill：${id}`);
  const next = { ...skill, status };
  skills.set(id, next);
  return next;
}
