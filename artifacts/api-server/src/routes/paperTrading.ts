import { Router } from "express";
import { db, positionsTable, ordersTable, tradeRecordsTable } from "@workspace/db";
import { ToggleStrategyExecutionParams } from "@workspace/api-zod";

const router = Router();

router.get("/positions", async (req, res) => {
  const positions = await db.select().from(positionsTable);
  res.json(positions.map(p => ({
    ...p,
    size: Number(p.size),
    entryPrice: Number(p.entryPrice),
    currentPrice: Number(p.currentPrice),
    unrealizedPnl: Number(p.unrealizedPnl),
    unrealizedPnlPct: Number(p.unrealizedPnlPct),
    openedAt: p.openedAt.toISOString(),
  })));
});

router.get("/orders", async (req, res) => {
  const orders = await db.select().from(ordersTable).orderBy(ordersTable.createdAt);
  res.json(orders.map(o => ({
    ...o,
    size: Number(o.size),
    price: Number(o.price),
    createdAt: o.createdAt.toISOString(),
  })));
});

router.get("/summary", async (req, res) => {
  const positions = await db.select().from(positionsTable);
  const trades = await db.select().from(tradeRecordsTable);

  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + Number(p.unrealizedPnl), 0);
  const realizedPnl = trades.filter(t => t.mode === "paper").reduce((sum, t) => sum + Number(t.pnl), 0);
  const winningTrades = trades.filter(t => t.mode === "paper" && Number(t.pnl) > 0).length;
  const totalTrades = trades.filter(t => t.mode === "paper").length;

  res.json({
    totalEquity: 10000 + totalUnrealizedPnl + realizedPnl,
    availableBalance: 10000 - positions.reduce((sum, p) => sum + Number(p.size) * Number(p.entryPrice), 0),
    totalUnrealizedPnl,
    totalRealizedPnl: realizedPnl,
    totalTrades,
    winRate: totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 10000) / 100 : 0,
    activeStrategies: 2,
  });
});

router.post("/strategies/:id/toggle", async (req, res) => {
  const { id } = ToggleStrategyExecutionParams.parse({ id: Number(req.params.id) });
  res.json({ strategyId: id, isRunning: Math.random() > 0.5 });
});

export default router;
