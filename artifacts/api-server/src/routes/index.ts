import { Router, type IRouter } from "express";
import healthRouter from "./health";
import okxSwapAiRouter from "./okxSwapAi";
import okxSwapShadowRouter from "./okxSwapShadow";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/okx-swap-ai", okxSwapAiRouter);
router.use("/okx-swap-shadow", okxSwapShadowRouter);

export default router;
