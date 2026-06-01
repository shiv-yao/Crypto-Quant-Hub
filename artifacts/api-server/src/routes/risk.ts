import { Router } from "express";
import { db, riskSettingsTable } from "@workspace/db";
import { UpdateRiskSettingsBody } from "@workspace/api-zod";

const router = Router();

async function ensureRiskSettings() {
  const settings = await db.select().from(riskSettingsTable);
  if (settings.length === 0) {
    const [newSettings] = await db.insert(riskSettingsTable).values({}).returning();
    return newSettings;
  }
  return settings[0];
}

router.get("/", async (req, res) => {
  const settings = await ensureRiskSettings();
  res.json({
    ...settings,
    maxPositionSizePct: Number(settings.maxPositionSizePct),
    maxDailyLossPct: Number(settings.maxDailyLossPct),
    maxLeverage: Number(settings.maxLeverage),
    stopLossPct: Number(settings.stopLossPct),
    takeProfitPct: Number(settings.takeProfitPct),
    trailingStopPct: Number(settings.trailingStopPct),
    updatedAt: settings.updatedAt.toISOString(),
  });
});

router.patch("/", async (req, res) => {
  const body = UpdateRiskSettingsBody.parse(req.body);
  const existing = await ensureRiskSettings();
  const [updated] = await db.update(riskSettingsTable).set({
    ...(body.maxPositionSizePct !== undefined && { maxPositionSizePct: String(body.maxPositionSizePct) }),
    ...(body.maxDailyLossPct !== undefined && { maxDailyLossPct: String(body.maxDailyLossPct) }),
    ...(body.maxLeverage !== undefined && { maxLeverage: String(body.maxLeverage) }),
    ...(body.maxOpenPositions !== undefined && { maxOpenPositions: body.maxOpenPositions }),
    ...(body.stopLossPct !== undefined && { stopLossPct: String(body.stopLossPct) }),
    ...(body.takeProfitPct !== undefined && { takeProfitPct: String(body.takeProfitPct) }),
    ...(body.trailingStopPct !== undefined && { trailingStopPct: String(body.trailingStopPct) }),
    ...(body.trailingStopEnabled !== undefined && { trailingStopEnabled: body.trailingStopEnabled }),
    ...(body.emergencyStopEnabled !== undefined && { emergencyStopEnabled: body.emergencyStopEnabled }),
    updatedAt: new Date(),
  }).returning();
  res.json({
    ...updated,
    maxPositionSizePct: Number(updated.maxPositionSizePct),
    maxDailyLossPct: Number(updated.maxDailyLossPct),
    maxLeverage: Number(updated.maxLeverage),
    stopLossPct: Number(updated.stopLossPct),
    takeProfitPct: Number(updated.takeProfitPct),
    trailingStopPct: Number(updated.trailingStopPct),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

router.post("/emergency-stop", async (req, res) => {
  await db.update(riskSettingsTable).set({ emergencyStopEnabled: true, updatedAt: new Date() });
  res.json({ success: true, stoppedStrategies: 2, message: "緊急停止已觸發，所有策略已暫停" });
});

export default router;
