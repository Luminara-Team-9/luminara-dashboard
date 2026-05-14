import pg from 'pg';

const { Pool } = pg;

export function createPool() {
  return new Pool({
    host: process.env.PGHOST ?? process.env.HOST_IP ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? process.env.POSTGRES_DB ?? 'core_db',
    user: process.env.PGUSER ?? process.env.POSTGRES_USER ?? 'lumin_admin',
    password: process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD,
    max: Number(process.env.PGPOOL_MAX ?? 4),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
