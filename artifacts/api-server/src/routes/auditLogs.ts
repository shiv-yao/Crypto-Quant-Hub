import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const logs = await db.select().from(auditLogsTable)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);

  res.json(logs.map(l => ({
    id: l.id,
    action: l.action,
    details: l.details,
    mode: l.mode,
    source: l.source,
    result: l.result,
    errorMessage: l.errorMessage,
    createdAt: l.createdAt.toISOString(),
  })));
});

export default router;
