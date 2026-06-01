import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapAutoTrader } from "./services/autoTrader.js";
import { bootstrapOkxSwapAiEngine } from "./services/okxSwapAiEngine.js";

// OKX Swap AI Demo stress-test defaults. Railway Variables still take precedence.
process.env.OKX_SWAP_MAX_POSITIONS ??= "20";
process.env.OKX_SWAP_POSITION_USDT ??= "10";
process.env.OKX_SWAP_MAX_EXPOSURE_USDT ??= "200";
process.env.OKX_SWAP_MAX_LEVERAGE ??= "2";
process.env.OKX_SWAP_STOP_LOSS_PCT ??= "2.5";
process.env.OKX_SWAP_TAKE_PROFIT_PCT ??= "4";
process.env.OKX_SWAP_SCAN_BATCH ??= "20";
process.env.OKX_SWAP_AI_INTERVAL_MS ??= "30000";
process.env.OKX_SWAP_AI_LONG_SCORE ??= "63";
process.env.OKX_SWAP_AI_SHORT_SCORE ??= "37";

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
});
