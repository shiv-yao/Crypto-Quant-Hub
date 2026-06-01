import { Router } from "express";
import {
  getAutoTraderState,
  runAutoTraderCycle,
  startAutoTrader,
  stopAutoTrader,
  ensureDefaultStrategies,
} from "../services/autoTrader.js";
import { db, positionsTable, strategiesTable, tradeRecordsTable, ordersTable, riskSettingsTable } from "@workspace/db";

const router = Router();

router.get("/status", async (_req, res) => {
  const [strategies, positions, trades, orders, riskRows] = await Promise.all([
    db.select().from(strategiesTable),
    db.select().from(positionsTable),
    db.select().from(tradeRecordsTable),
    db.select().from(ordersTable),
    db.select().from(riskSettingsTable).limit(1),
  ]);

  res.json({
    ...getAutoTraderState(),
    strategyCount: strategies.length,
    activeStrategyCount: strategies.filter((item) => item.isActive).length,
    positionCount: positions.length,
    tradeCount: trades.length,
    orderCount: orders.length,
    risk: riskRows[0] ?? null,
  });
});

router.post("/bootstrap", async (_req, res) => {
  const strategies = await ensureDefaultStrategies();
  res.json({ success: true, createdOrExistingStrategies: strategies.length });
});

router.post("/start", async (_req, res) => {
  res.json({ success: true, state: startAutoTrader() });
});

router.post("/stop", async (_req, res) => {
  res.json({ success: true, state: stopAutoTrader() });
});

router.post("/run-once", async (_req, res) => {
  res.json({ success: true, state: await runAutoTraderCycle() });
});

export default router;
