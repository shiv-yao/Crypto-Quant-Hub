import { Router } from "express";
import { getOkxSwapOptimizerState } from "../services/okxSwapOptimizerRunner.js";
import { hydrateEvolutionState } from "../services/okxSwapEvolution.js";

const router = Router();

router.get("/status", async (_req, res) => {
  await hydrateEvolutionState();
  res.json(getOkxSwapOptimizerState());
});

export default router;
