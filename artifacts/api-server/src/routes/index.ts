import { Router, type IRouter } from "express";
import healthRouter from "./health";
import strategiesRouter from "./strategies";
import backtestsRouter from "./backtests";
import paperTradingRouter from "./paperTrading";
import riskRouter from "./risk";
import tradesRouter from "./trades";
import marketRouter from "./market";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/strategies", strategiesRouter);
router.use("/backtests", backtestsRouter);
router.use("/paper-trading", paperTradingRouter);
router.use("/risk", riskRouter);
router.use("/trades", tradesRouter);
router.use("/market", marketRouter);
router.use("/dashboard", marketRouter);
router.use("/settings", settingsRouter);

export default router;
