import http from 'node:http';
import { createPool } from './db.js';
import { getDashboardPerformanceData } from './dashboardData.js';

const host = process.env.DASHBOARD_API_HOST ?? process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.DASHBOARD_API_PORT ?? process.env.PORT ?? 3024);
const pools = {
  core: createPool({ database: process.env.CORE_PGDATABASE ?? 'core_db' }),
  lhci: createPool({ database: process.env.LHCI_PGDATABASE ?? 'lhci' }),
};
const APPLY_ENABLED = process.env.AI_ACTION_APPLY_ENABLED === 'true';

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': process.env.DASHBOARD_API_CORS_ORIGIN ?? '*',
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('request_body_too_large'));
        request.destroy();
      }
    });

    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
}

function isApplyRequest(payload) {
  return (
    payload &&
    typeof payload === 'object' &&
    typeof payload.actionId === 'string' &&
    payload.actionId.length > 0 &&
    payload.source === 'dashboard' &&
    payload.action === 'apply'
  );
}

async function approveFixPlan(pool, payload) {
  const planId = Number(payload.actionId);

  if (!Number.isInteger(planId) || planId <= 0) {
    return {
      statusCode: 400,
      body: {
        actionId: payload.actionId,
        accepted: false,
        status: 'failed',
        message: 'AI 액션 플랜 ID가 올바르지 않습니다.',
        source: 'dashboard-api',
      },
    };
  }

  if (!APPLY_ENABLED) {
    return {
      statusCode: 202,
      body: {
        actionId: payload.actionId,
        accepted: false,
        status: 'approval-ready',
        message: '승인 기록 경로는 준비되어 있지만 실제 적용 신호는 비활성화되어 있습니다.',
        queuedAt: new Date().toISOString(),
        source: 'dashboard-api',
      },
    };
  }

  const result = await pool.query(
    `
      UPDATE fix_plans
      SET
        patch_status = 'approved_to_apply',
        approved_by = 'dashboard',
        attempt_history = COALESCE(attempt_history::jsonb, '[]'::jsonb) || $2::jsonb,
        updated_at = NOW()
      WHERE id = $1
        AND COALESCE(patch_status, '') NOT IN (
          'approved_to_apply',
          'applying',
          'patch_applied',
          'applied',
          'completed'
        )
      RETURNING id, patch_status, updated_at
    `,
    [
      planId,
      JSON.stringify([{
        event: 'dashboard_apply_approved',
        source: 'dashboard',
        requested_at: payload.requestedAt ?? new Date().toISOString(),
      }]),
    ],
  );

  if (result.rowCount === 0) {
    return {
      statusCode: 409,
      body: {
        actionId: payload.actionId,
        accepted: false,
        status: 'failed',
        message: '이미 적용 대기/진행/완료 상태이거나 액션 플랜을 찾을 수 없습니다.',
        source: 'dashboard-api',
      },
    };
  }

  return {
    statusCode: 202,
    body: {
      actionId: payload.actionId,
      accepted: true,
      status: 'approval-pending',
      message: 'AI 적용 승인 신호를 기록했습니다. 적용 Worker가 처리하면 상태가 갱신됩니다.',
      queuedAt: result.rows[0]?.updated_at?.toISOString?.() ?? new Date().toISOString(),
      nextPollMs: 30_000,
      source: 'dashboard-api',
    },
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': process.env.DASHBOARD_API_CORS_ORIGIN ?? '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
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
      const payload = await getDashboardPerformanceData(pools, {
        range: url.searchParams.get('range'),
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
      });
      sendJson(response, 200, payload);
    } catch (error) {
      sendJson(response, 500, {
        error: 'dashboard_data_query_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/dashboard/ai-actions/apply') {
    try {
      const payload = await readJsonBody(request);

      if (!isApplyRequest(payload)) {
        sendJson(response, 400, {
          actionId: '',
          accepted: false,
          status: 'failed',
          message: 'AI 적용 요청 형식이 올바르지 않습니다.',
          source: 'dashboard-api',
        });
        return;
      }

      const result = await approveFixPlan(pools.core, payload);
      sendJson(response, result.statusCode, result.body);
    } catch (error) {
      sendJson(response, 500, {
        actionId: '',
        accepted: false,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        source: 'dashboard-api',
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
