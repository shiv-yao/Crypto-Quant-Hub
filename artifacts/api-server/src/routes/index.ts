import { Router, type IRouter } from "express";
import healthRouter from "./health";
import strategiesRouter from "./strategies";
import backtestsRouter from "./backtests";
import paperTradingRouter from "./paperTrading";
import riskRouter from "./risk";
import tradesRouter from "./trades";
import marketRouter from "./market";
import settingsRouter from "./settings";
import exchangeRouter from "./exchange";
import bitgetRouter from "./bitget";
import auditLogsRouter from "./auditLogs";

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
router.use("/exchange", exchangeRouter);
router.use("/bitget", bitgetRouter);
router.use("/audit-logs", auditLogsRouter);

export default router;
