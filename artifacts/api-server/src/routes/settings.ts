import { Router } from "express";
import { db, systemSettingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router = Router();

async function ensureSettings() {
  const settings = await db.select().from(systemSettingsTable);
  if (settings.length === 0) {
    const [newSettings] = await db.insert(systemSettingsTable).values({}).returning();
    return newSettings;
  }
  return settings[0];
}

router.get("/", async (req, res) => {
  const settings = await ensureSettings();
  res.json({ ...settings, updatedAt: settings.updatedAt.toISOString() });
});

router.patch("/", async (req, res) => {
  const body = UpdateSettingsBody.parse(req.body);
  const existing = await ensureSettings();
  const [updated] = await db.update(systemSettingsTable).set({
    ...(body.mode !== undefined && { mode: body.mode }),
    ...(body.exchangeName !== undefined && { exchangeName: body.exchangeName }),
    updatedAt: new Date(),
  }).returning();
  res.json({ ...updated, updatedAt: updated.updatedAt.toISOString() });
});

export default router;
