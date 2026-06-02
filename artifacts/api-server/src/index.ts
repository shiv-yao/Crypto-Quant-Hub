import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapAutoTrader } from "./services/autoTrader.js";
import { bootstrapOkxSwapAiEngine } from "./services/okxSwapAiEngine.js";
import { bootstrapOkxSwapOptimizer } from "./services/okxSwapOptimizerRunner.js";

// OKX Swap AI Demo: higher-leverage, lower-capital stress-test defaults.
// Railway Variables still take precedence. Mainnet trading remains locked.
process.env.OKX_SWAP_MAX_POSITIONS ??= "10";
process.env.OKX_SWAP_POSITION_USDT ??= "5";
process.env.OKX_SWAP_MAX_SINGLE_USDT ??= "5";
process.env.OKX_SWAP_MAX_EXPOSURE_USDT ??= "50";
process.env.OKX_SWAP_MAX_LEVERAGE ??= "3";
process.env.OKX_SWAP_STOP_LOSS_PCT ??= "1.2";
process.env.OKX_SWAP_TAKE_PROFIT_PCT ??= "2.4";
process.env.OKX_SWAP_SCAN_BATCH ??= "20";
process.env.OKX_SWAP_AI_INTERVAL_MS ??= "30000";
process.env.OKX_SWAP_AI_LONG_SCORE ??= "65";
process.env.OKX_SWAP_AI_SHORT_SCORE ??= "35";

// Read-only shadow learning defaults. This service reads public OKX market data,
// simulates candidate profiles, and never places orders or changes live settings.
process.env.OKX_SWAP_OPTIMIZER_ENABLED ??= "true";
process.env.OKX_SWAP_OPTIMIZER_INTERVAL_MS ??= "60000";
process.env.OKX_SWAP_OPTIMIZER_SCAN_BATCH ??= "12";
process.env.OKX_SWAP_OPTIMIZER_MIN_TRADES ??= "24";
process.env.OKX_SWAP_OPTIMIZER_MIN_IMPROVEMENT ??= "5";

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
