import pg from 'pg';

const { Pool } = pg;

export function createPool(options = {}) {
  return new Pool({
    host: process.env.PGHOST ?? process.env.PG_HOST ?? process.env.HOST_IP ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? process.env.PG_PORT ?? 5432),
    database: options.database ?? process.env.PGDATABASE ?? process.env.PG_DATABASE ?? process.env.POSTGRES_DB ?? 'core_db',
    user: process.env.PGUSER ?? process.env.PG_USER ?? process.env.POSTGRES_USER ?? 'lumin_admin',
    password: process.env.PGPASSWORD ?? process.env.PG_PASSWORD ?? process.env.POSTGRES_PASSWORD,
    max: Number(process.env.PGPOOL_MAX ?? process.env.PG_POOL_MAX ?? 4),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
