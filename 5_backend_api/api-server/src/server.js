import http from 'node:http';
import { createPool } from './db.js';
import { getDashboardPerformanceData } from './dashboardData.js';

const host = process.env.DASHBOARD_API_HOST ?? '127.0.0.1';
const port = Number(process.env.DASHBOARD_API_PORT ?? 3024);
const pools = {
  core: createPool({ database: process.env.CORE_PGDATABASE ?? 'core_db' }),
  lhci: createPool({ database: process.env.LHCI_PGDATABASE ?? 'lhci' }),
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': process.env.DASHBOARD_API_CORS_ORIGIN ?? '*',
  });
  response.end(JSON.stringify(payload));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': process.env.DASHBOARD_API_CORS_ORIGIN ?? '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type, accept',
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { ok: true, service: 'dashboard-api-server' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/dashboard/performance') {
    try {
      const payload = await getDashboardPerformanceData(pools);
      sendJson(response, 200, payload);
    } catch (error) {
      sendJson(response, 500, {
        error: 'dashboard_data_query_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  sendJson(response, 404, { error: 'not_found' });
});

server.listen(port, host, () => {
  console.log(`dashboard-api-server listening on http://${host}:${port}`);
});

async function shutdown() {
  server.close();
  await Promise.all([pools.core.end(), pools.lhci.end()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
