import { Router } from "express";
import { db, strategiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateStrategyBody, UpdateStrategyBody, UpdateStrategyParams, GetStrategyParams, DeleteStrategyParams } from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  const strategies = await db.select().from(strategiesTable).orderBy(strategiesTable.createdAt);
  res.json(strategies.map(s => ({
    ...s,
    params: s.params as Record<string, unknown>,
    createdAt: s.createdAt.toISOString(),
  })));
});

router.post("/", async (req, res) => {
  const body = CreateStrategyBody.parse(req.body);
  const [strategy] = await db.insert(strategiesTable).values({
    name: body.name,
    type: body.type,
    symbol: body.symbol,
    interval: body.interval,
    params: body.params,
    description: body.description ?? null,
  }).returning();
  res.status(201).json({ ...strategy, params: strategy.params as Record<string, unknown>, createdAt: strategy.createdAt.toISOString() });
});

router.get("/:id", async (req, res) => {
  const { id } = GetStrategyParams.parse({ id: Number(req.params.id) });
  const [strategy] = await db.select().from(strategiesTable).where(eq(strategiesTable.id, id));
  if (!strategy) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...strategy, params: strategy.params as Record<string, unknown>, createdAt: strategy.createdAt.toISOString() });
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateStrategyParams.parse({ id: Number(req.params.id) });
  const body = UpdateStrategyBody.parse(req.body);
  const [strategy] = await db.update(strategiesTable).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.symbol !== undefined && { symbol: body.symbol }),
    ...(body.interval !== undefined && { interval: body.interval }),
    ...(body.params !== undefined && { params: body.params }),
    ...(body.isActive !== undefined && { isActive: body.isActive }),
    ...(body.description !== undefined && { description: body.description }),
  }).where(eq(strategiesTable.id, id)).returning();
  if (!strategy) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...strategy, params: strategy.params as Record<string, unknown>, createdAt: strategy.createdAt.toISOString() });
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteStrategyParams.parse({ id: Number(req.params.id) });
  await db.delete(strategiesTable).where(eq(strategiesTable.id, id));
  res.status(204).send();
});

export default router;
