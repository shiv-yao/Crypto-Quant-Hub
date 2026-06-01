import { spawn, spawnSync } from "node:child_process";

const candidateKeys = [
  "DATABASE_URL",
  "DATABASE_PRIVATE_URL",
  "DATABASE_PUBLIC_URL",
  "POSTGRES_URL",
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
];

const presentKeys = candidateKeys.filter((key) => Boolean(process.env[key]));
console.log(`[startup] Available database variable names: ${presentKeys.join(", ") || "none"}`);

function buildDatabaseUrl() {
  const directCandidates = [
    ["DATABASE_URL", process.env.DATABASE_URL],
    ["DATABASE_PRIVATE_URL", process.env.DATABASE_PRIVATE_URL],
    ["DATABASE_PUBLIC_URL", process.env.DATABASE_PUBLIC_URL],
    ["POSTGRES_URL", process.env.POSTGRES_URL],
  ];

  for (const [source, value] of directCandidates) {
    if (value) {
      return { source, value };
    }
  }

  const host = process.env.PGHOST;
  const port = process.env.PGPORT || "5432";
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE || "railway";

  if (host && user && password) {
    const value = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
    return { source: "PG* variables", value };
  }

  return null;
}

const resolved = buildDatabaseUrl();
if (!resolved) {
  console.error("[startup] No usable PostgreSQL configuration was provided to this service.");
  console.error("[startup] Add DATABASE_URL to Crypto-Quant-Hub, or provide PGHOST, PGPORT, PGUSER, PGPASSWORD, and PGDATABASE.");
  process.exit(1);
}

console.log(`[startup] PostgreSQL configuration source: ${resolved.source}`);
const childEnv = { ...process.env, DATABASE_URL: resolved.value };

const bootstrap = spawnSync("node", ["lib/db/src/bootstrap.mjs"], {
  env: childEnv,
  stdio: "inherit",
});

if (bootstrap.status !== 0) {
  console.error(`[startup] Database bootstrap failed with status ${bootstrap.status ?? "unknown"}`);
  process.exit(bootstrap.status ?? 1);
}

const api = spawn(
  "node",
  ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"],
  { env: childEnv, stdio: "inherit" },
);

api.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[startup] API exited due to signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
