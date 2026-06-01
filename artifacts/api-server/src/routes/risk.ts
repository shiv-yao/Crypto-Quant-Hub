import { Router } from "express";
import { db, riskSettingsTable, strategiesTable, auditLogsTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

async function ensureRiskSettings() {
  const rows = await db.select().from(riskSettingsTable);
  if (rows.length === 0) {
    const [newRow] = await db.insert(riskSettingsTable).values({}).returning();
    return newRow;
  }
  return rows[0];
}

const UpdateRiskSchema = z.object({
  maxPositionSizePct: z.number().optional(),
  maxDailyLossPct: z.number().optional(),
  maxLeverage: z.number().optional(),
  maxOpenPositions: z.number().int().optional(),
  stopLossPct: z.number().optional(),
  takeProfitPct: z.number().optional(),
  trailingStopPct: z.number().optional(),
  trailingStopEnabled: z.boolean().optional(),
  emergencyStopEnabled: z.boolean().optional(),
  maxSingleOrderUsdt: z.number().optional(),
  maxTotalExposureUsdt: z.number().optional(),
  maxConsecutiveLosses: z.number().int().optional(),
  allowedSymbols: z.array(z.string()).optional(),
});

function toRiskResponse(r: typeof riskSettingsTable.$inferSelect) {
  return {
    ...r,
    maxPositionSizePct: Number(r.maxPositionSizePct),
    maxDailyLossPct: Number(r.maxDailyLossPct),
    maxLeverage: Number(r.maxLeverage),
    stopLossPct: Number(r.stopLossPct),
    takeProfitPct: Number(r.takeProfitPct),
    trailingStopPct: Number(r.trailingStopPct),
    maxSingleOrderUsdt: Number(r.maxSingleOrderUsdt),
    maxTotalExposureUsdt: Number(r.maxTotalExposureUsdt),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/", async (req, res) => {
  const settings = await ensureRiskSettings();
  res.json(toRiskResponse(settings));
});

router.patch("/", async (req, res) => {
  const body = UpdateRiskSchema.parse(req.body);
  await ensureRiskSettings();

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.maxPositionSizePct !== undefined) patch.maxPositionSizePct = String(body.maxPositionSizePct);
  if (body.maxDailyLossPct !== undefined) patch.maxDailyLossPct = String(body.maxDailyLossPct);
  if (body.maxLeverage !== undefined) patch.maxLeverage = String(body.maxLeverage);
  if (body.maxOpenPositions !== undefined) patch.maxOpenPositions = body.maxOpenPositions;
  if (body.stopLossPct !== undefined) patch.stopLossPct = String(body.stopLossPct);
  if (body.takeProfitPct !== undefined) patch.takeProfitPct = String(body.takeProfitPct);
  if (body.trailingStopPct !== undefined) patch.trailingStopPct = String(body.trailingStopPct);
  if (body.trailingStopEnabled !== undefined) patch.trailingStopEnabled = body.trailingStopEnabled;
  if (body.emergencyStopEnabled !== undefined) patch.emergencyStopEnabled = body.emergencyStopEnabled;
  if (body.maxSingleOrderUsdt !== undefined) patch.maxSingleOrderUsdt = String(body.maxSingleOrderUsdt);
  if (body.maxTotalExposureUsdt !== undefined) patch.maxTotalExposureUsdt = String(body.maxTotalExposureUsdt);
  if (body.maxConsecutiveLosses !== undefined) patch.maxConsecutiveLosses = body.maxConsecutiveLosses;
  if (body.allowedSymbols !== undefined) patch.allowedSymbols = body.allowedSymbols;

  const [updated] = await db
    .update(riskSettingsTable)
    .set(patch as Parameters<ReturnType<typeof db.update>["set"]>[0])
    .returning();

  await db.insert(auditLogsTable).values({
    action: "risk_settings_updated",
    details: body as Record<string, unknown>,
    mode: "paper",
    source: "manual",
    result: "success",
  });

  res.json(toRiskResponse(updated));
});

router.post("/emergency-stop", async (req, res) => {
  await db.update(riskSettingsTable).set({ emergencyStopEnabled: true, updatedAt: new Date() });
  const strategies = await db.update(strategiesTable).set({ isActive: false }).returning();
  await db.insert(auditLogsTable).values({
    action: "emergency_stop",
    details: { stoppedStrategies: strategies.length },
    mode: "paper",
    source: "manual",
    result: "success",
  });
  res.json({ success: true, stoppedStrategies: strategies.length, message: "緊急停止已觸發，所有策略已暫停" });
});

export default router;
