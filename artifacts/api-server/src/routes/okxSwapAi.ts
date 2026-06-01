import { Router } from "express";
import { z } from "zod";
import {
  getOkxSwapAiState,
  runOkxSwapAiCycle,
  startOkxSwapAiEngine,
  stopOkxSwapAiEngine,
} from "../services/okxSwapAiEngine.js";
import { listOkxSwapSkills, setOkxSwapSkillStatus } from "../services/okxSwapSkills.js";
import { createOkxSwapService } from "../services/okxSwap.js";

const router = Router();

router.get("/status", (_req, res) => {
  res.json(getOkxSwapAiState());
});

router.get("/skills", (_req, res) => {
  res.json({ skills: listOkxSwapSkills() });
});

const SkillUpdateSchema = z.object({
  status: z.enum(["enabled", "disabled"]),
});

router.post("/skills/:id", (req, res) => {
  try {
    const body = SkillUpdateSchema.parse(req.body);
    res.json({ success: true, skill: setOkxSwapSkillStatus(req.params.id, body.status) });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : "更新 Skill 失敗" });
  }
});

router.post("/start", (_req, res) => {
  res.json({ success: true, state: startOkxSwapAiEngine() });
});

router.post("/stop", (_req, res) => {
  res.json({ success: true, state: stopOkxSwapAiEngine() });
});

router.post("/run-once", async (_req, res) => {
  res.json({ success: true, state: await runOkxSwapAiCycle() });
});

router.get("/universe", async (_req, res) => {
  try {
    const client = createOkxSwapService();
    const [instruments, tickers] = await Promise.all([client.getSwapInstruments(), client.getSwapTickers()]);
    const instrumentMap = new Map(instruments.map((item) => [item.instId, item]));
    const data = tickers
      .filter((ticker) => ticker.instId.endsWith("-USDT-SWAP"))
      .filter((ticker) => instrumentMap.get(ticker.instId)?.state === "live")
      .map((ticker) => ({
        instId: ticker.instId,
        price: Number(ticker.last),
        volume24h: Number(ticker.volCcy24h),
        high24h: Number(ticker.high24h),
        low24h: Number(ticker.low24h),
      }))
      .sort((a, b) => b.volume24h - a.volume24h);
    res.json({ source: "okx_public_mainnet", count: data.length, data });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "取得 OKX 合約清單失敗" });
  }
});

export default router;
