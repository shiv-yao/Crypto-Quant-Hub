import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapAutoTrader } from "./services/autoTrader.js";
import { bootstrapOkxSwapAiEngine } from "./services/okxSwapAiEngine.js";
import { bootstrapOkxSwapOptimizer } from "./services/okxSwapOptimizerRunner.js";

// OKX Swap AI Demo Turbo defaults.
// Railway Variables still take precedence. Mainnet trading remains locked.
// OKX_SWAP_MAX_POSITIONS=0 means unlimited position count; exposure guards still apply.
process.env.OKX_SWAP_MAX_POSITIONS ??= "0";
process.env.OKX_SWAP_POSITION_USDT ??= "10";
process.env.OKX_SWAP_MAX_SINGLE_USDT ??= "10";
process.env.OKX_SWAP_MAX_EXPOSURE_USDT ??= "500";
process.env.OKX_SWAP_MAX_LEVERAGE ??= "3";
process.env.OKX_SWAP_STOP_LOSS_PCT ??= "1.2";
process.env.OKX_SWAP_TAKE_PROFIT_PCT ??= "2.4";
process.env.OKX_SWAP_SCAN_BATCH ??= "20";
process.env.OKX_SWAP_AI_INTERVAL_MS ??= "30000";
process.env.OKX_SWAP_AI_LONG_SCORE ??= "65";
process.env.OKX_SWAP_AI_SHORT_SCORE ??= "35";

// Guarded Demo-only automatic tuning defaults.
// AI may adjust entry thresholds, base position size and leverage within hard bounds only.
process.env.OKX_SWAP_AUTO_TUNE_ENABLED ??= "true";
process.env.OKX_SWAP_AUTO_TUNE_COOLDOWN_HOURS ??= "1";
process.env.OKX_SWAP_AUTO_TUNE_MIN_POSITION_USDT ??= "2";
process.env.OKX_SWAP_AUTO_TUNE_MAX_POSITION_USDT ??= "10";
process.env.OKX_SWAP_AUTO_TUNE_MAX_SINGLE_USDT ??= "10";
process.env.OKX_SWAP_AUTO_TUNE_MAX_LEVERAGE ??= "3";

// Read-only shadow learning defaults. This service reads public OKX market data,
// simulates candidate profiles, and never places orders by itself.
process.env.OKX_SWAP_OPTIMIZER_ENABLED ??= "true";
process.env.OKX_SWAP_OPTIMIZER_INTERVAL_MS ??= "60000";
process.env.OKX_SWAP_OPTIMIZER_SCAN_BATCH ??= "12";
process.env.OKX_SWAP_OPTIMIZER_MIN_TRADES ??= "50";
process.env.OKX_SWAP_OPTIMIZER_MIN_IMPROVEMENT ??= "8";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  bootstrapAutoTrader();
  bootstrapOkxSwapAiEngine();
  bootstrapOkxSwapOptimizer();
});
