import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set before database bootstrap");
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS strategies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backtest_results (
  id SERIAL PRIMARY KEY,
  strategy_id INTEGER NOT NULL,
  strategy_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  initial_capital NUMERIC(20, 8) NOT NULL,
  final_capital NUMERIC(20, 8) NOT NULL,
  total_return NUMERIC(10, 4) NOT NULL,
  annualized_return NUMERIC(10, 4) NOT NULL,
  max_drawdown NUMERIC(10, 4) NOT NULL,
  win_rate NUMERIC(10, 4) NOT NULL,
  profit_factor NUMERIC(10, 4) NOT NULL,
  total_trades INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  equity_curve JSONB,
  trades JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  size NUMERIC(20, 8) NOT NULL,
  entry_price NUMERIC(20, 8) NOT NULL,
  current_price NUMERIC(20, 8) NOT NULL,
  unrealized_pnl NUMERIC(20, 8) NOT NULL,
  unrealized_pnl_pct NUMERIC(10, 4) NOT NULL,
  strategy_name TEXT NOT NULL,
  opened_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  type TEXT NOT NULL,
  size NUMERIC(20, 8) NOT NULL,
  price NUMERIC(20, 8) NOT NULL,
  status TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_settings (
  id SERIAL PRIMARY KEY,
  max_position_size_pct NUMERIC(10, 4) NOT NULL DEFAULT 5,
  max_daily_loss_pct NUMERIC(10, 4) NOT NULL DEFAULT 3,
  max_leverage NUMERIC(10, 2) NOT NULL DEFAULT 1,
  max_open_positions INTEGER NOT NULL DEFAULT 5,
  stop_loss_pct NUMERIC(10, 4) NOT NULL DEFAULT 2,
  take_profit_pct NUMERIC(10, 4) NOT NULL DEFAULT 6,
  trailing_stop_pct NUMERIC(10, 4) NOT NULL DEFAULT 1.5,
  trailing_stop_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_stop_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  max_single_order_usdt NUMERIC(20, 2) NOT NULL DEFAULT 500,
  max_total_exposure_usdt NUMERIC(20, 2) NOT NULL DEFAULT 2000,
  max_consecutive_losses INTEGER NOT NULL DEFAULT 5,
  allowed_symbols JSONB NOT NULL DEFAULT '["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"]'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trade_records (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  size NUMERIC(20, 8) NOT NULL,
  price NUMERIC(20, 8) NOT NULL,
  fee NUMERIC(20, 8) NOT NULL,
  pnl NUMERIC(20, 8) NOT NULL,
  pnl_pct NUMERIC(10, 4) NOT NULL,
  strategy_name TEXT NOT NULL,
  executed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  mode TEXT NOT NULL DEFAULT 'paper',
  order_source TEXT NOT NULL DEFAULT 'strategy',
  exchange_order_id TEXT
);

CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'paper',
  exchange_name TEXT NOT NULL DEFAULT 'Binance',
  network_mode TEXT NOT NULL DEFAULT 'testnet',
  api_key_set BOOLEAN NOT NULL DEFAULT FALSE,
  trading_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  live_ready_step INTEGER NOT NULL DEFAULT 0,
  connection_status TEXT NOT NULL DEFAULT 'disconnected',
  connection_error TEXT,
  last_connected_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exchange_connections (
  id SERIAL PRIMARY KEY,
  exchange TEXT NOT NULL DEFAULT 'Binance',
  api_key_encrypted TEXT,
  api_secret_encrypted TEXT,
  network_mode TEXT NOT NULL DEFAULT 'testnet',
  is_connected BOOLEAN NOT NULL DEFAULT FALSE,
  last_tested_at TIMESTAMP,
  connection_error TEXT,
  account_info JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  details JSONB,
  mode TEXT NOT NULL DEFAULT 'paper',
  source TEXT NOT NULL DEFAULT 'manual',
  result TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_pnl (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  realized_pnl NUMERIC(20, 8) NOT NULL DEFAULT 0,
  trade_count INTEGER NOT NULL DEFAULT 0,
  consecutive_losses INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

const maxAttempts = 20;
const retryDelayMs = 3000;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    console.log(`[db-bootstrap] Connecting to PostgreSQL (attempt ${attempt}/${maxAttempts})`);
    await pool.query("SELECT 1");
    await pool.query(schemaSql);
    console.log("[db-bootstrap] Database schema is ready");
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error(`[db-bootstrap] Attempt ${attempt} failed`, error);
    await pool.end().catch(() => undefined);
    if (attempt === maxAttempts) {
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}
