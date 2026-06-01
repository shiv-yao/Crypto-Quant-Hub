import { Router } from "express";
import { db, backtestResultsTable, strategiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RunBacktestBody, GetBacktestParams } from "@workspace/api-zod";

const router = Router();

function generateEquityCurve(startDate: string, endDate: string, initialCapital: number, totalReturn: number) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const points = [];
  let value = initialCapital;
  const dailyTarget = Math.pow(1 + totalReturn / 100, 1 / days);
  for (let i = 0; i <= Math.min(days, 365); i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const noise = (Math.random() - 0.48) * 0.015;
    value = value * (dailyTarget + noise);
    points.push({ date: date.toISOString().split("T")[0], value: Math.round(value * 100) / 100 });
  }
  return points;
}

function generateBacktestTrades(totalTrades: number, winRate: number, startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const span = end.getTime() - start.getTime();
  const trades = [];
  for (let i = 0; i < totalTrades; i++) {
    const isWin = Math.random() < winRate / 100;
    const entryTime = new Date(start.getTime() + (span / totalTrades) * i);
    const exitTime = new Date(entryTime.getTime() + 1000 * 60 * 60 * (4 + Math.random() * 20));
    const entryPrice = 60000 + Math.random() * 10000;
    const pnlPct = isWin ? (1 + Math.random() * 5) : -(0.5 + Math.random() * 2);
    const exitPrice = entryPrice * (1 + pnlPct / 100);
    const pnl = (exitPrice - entryPrice) * 0.01;
    trades.push({
      id: i + 1,
      side: Math.random() > 0.5 ? "long" : "short",
      entryPrice: Math.round(entryPrice * 100) / 100,
      exitPrice: Math.round(exitPrice * 100) / 100,
      entryDate: entryTime.toISOString(),
      exitDate: exitTime.toISOString(),
      pnl: Math.round(pnl * 100) / 100,
      pnlPct: Math.round(pnlPct * 100) / 100,
    });
  }
  return trades;
}

router.get("/", async (req, res) => {
  const results = await db.select().from(backtestResultsTable).orderBy(backtestResultsTable.createdAt);
  res.json(results.map(r => ({
    ...r,
    initialCapital: Number(r.initialCapital),
    finalCapital: Number(r.finalCapital),
    totalReturn: Number(r.totalReturn),
    annualizedReturn: Number(r.annualizedReturn),
    maxDrawdown: Number(r.maxDrawdown),
    winRate: Number(r.winRate),
    profitFactor: Number(r.profitFactor),
    createdAt: r.createdAt.toISOString(),
    equityCurve: r.equityCurve as unknown[] ?? [],
    trades: r.trades as unknown[] ?? [],
  })));
});

router.post("/", async (req, res) => {
  const body = RunBacktestBody.parse(req.body);
  const [strategy] = await db.select().from(strategiesTable).where(eq(strategiesTable.id, body.strategyId));
  if (!strategy) { res.status(404).json({ error: "Strategy not found" }); return; }

  const totalReturn = 15 + Math.random() * 45;
  const days = Math.ceil((new Date(body.endDate).getTime() - new Date(body.startDate).getTime()) / (1000 * 60 * 60 * 24));
  const years = days / 365;
  const annualizedReturn = (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100;
  const maxDrawdown = 5 + Math.random() * 20;
  const winRate = 45 + Math.random() * 25;
  const profitFactor = 1.2 + Math.random() * 1.5;
  const totalTrades = Math.floor(20 + Math.random() * 80);
  const finalCapital = body.initialCapital * (1 + totalReturn / 100);

  const equityCurve = generateEquityCurve(body.startDate, body.endDate, body.initialCapital, totalReturn);
  const trades = generateBacktestTrades(totalTrades, winRate, body.startDate, body.endDate);

  const [result] = await db.insert(backtestResultsTable).values({
    strategyId: body.strategyId,
    strategyName: strategy.name,
    symbol: strategy.symbol,
    interval: strategy.interval,
    startDate: body.startDate,
    endDate: body.endDate,
    initialCapital: String(body.initialCapital),
    finalCapital: String(Math.round(finalCapital * 100) / 100),
    totalReturn: String(Math.round(totalReturn * 100) / 100),
    annualizedReturn: String(Math.round(annualizedReturn * 100) / 100),
    maxDrawdown: String(Math.round(maxDrawdown * 100) / 100),
    winRate: String(Math.round(winRate * 100) / 100),
    profitFactor: String(Math.round(profitFactor * 100) / 100),
    totalTrades,
    status: "completed",
    equityCurve,
    trades,
  }).returning();

  res.status(201).json({
    ...result,
    initialCapital: Number(result.initialCapital),
    finalCapital: Number(result.finalCapital),
    totalReturn: Number(result.totalReturn),
    annualizedReturn: Number(result.annualizedReturn),
    maxDrawdown: Number(result.maxDrawdown),
    winRate: Number(result.winRate),
    profitFactor: Number(result.profitFactor),
    createdAt: result.createdAt.toISOString(),
    equityCurve: result.equityCurve as unknown[],
    trades: result.trades as unknown[],
  });
});

router.get("/:id", async (req, res) => {
  const { id } = GetBacktestParams.parse({ id: Number(req.params.id) });
  const [result] = await db.select().from(backtestResultsTable).where(eq(backtestResultsTable.id, id));
  if (!result) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    ...result,
    initialCapital: Number(result.initialCapital),
    finalCapital: Number(result.finalCapital),
    totalReturn: Number(result.totalReturn),
    annualizedReturn: Number(result.annualizedReturn),
    maxDrawdown: Number(result.maxDrawdown),
    winRate: Number(result.winRate),
    profitFactor: Number(result.profitFactor),
    createdAt: result.createdAt.toISOString(),
    equityCurve: result.equityCurve as unknown[] ?? [],
    trades: result.trades as unknown[] ?? [],
  });
});

export default router;
