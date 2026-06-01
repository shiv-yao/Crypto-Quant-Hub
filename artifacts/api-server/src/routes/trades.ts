import { Router } from "express";
import { db, tradeRecordsTable } from "@workspace/db";

const router = Router();

router.get("/", async (req, res) => {
  const trades = await db.select().from(tradeRecordsTable).orderBy(tradeRecordsTable.executedAt);
  res.json(trades.map(t => ({
    ...t,
    size: Number(t.size),
    price: Number(t.price),
    fee: Number(t.fee),
    pnl: Number(t.pnl),
    pnlPct: Number(t.pnlPct),
    executedAt: t.executedAt.toISOString(),
  })));
});

export default router;
