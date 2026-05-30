import { NextRequest, NextResponse } from 'next/server';
import type { AiActionApplyRequest, AiActionApplyResponse } from '@/shared/lib/types';

const REMEDIATION_API_URL =
  process.env.DASHBOARD_REMEDIATION_API_URL ?? process.env.REMEDIATION_AGENT_API_URL;
const PERFORMANCE_API_URL =
  process.env.DASHBOARD_PERFORMANCE_API_URL ?? process.env.DASHBOARD_DATA_API_URL;
const DASHBOARD_AI_ACTION_API_URL = process.env.DASHBOARD_AI_ACTION_API_URL;
const APPLY_ENABLED = process.env.AI_ACTION_APPLY_ENABLED === 'true';
const APPLY_MODE = process.env.AI_ACTION_APPLY_MODE ?? 'db-approval';

function buildDashboardActionEndpoint(): string | null {
  if (DASHBOARD_AI_ACTION_API_URL) return DASHBOARD_AI_ACTION_API_URL;
  if (!PERFORMANCE_API_URL) return null;

  try {
    const url = new URL(PERFORMANCE_API_URL);
    url.pathname = '/dashboard/ai-actions/apply';
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

function isApplyRequest(value: unknown): value is AiActionApplyRequest {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<AiActionApplyRequest>;
  return (
    typeof candidate.actionId === 'string' &&
    candidate.actionId.length > 0 &&
    candidate.source === 'dashboard' &&
    candidate.action === 'apply' &&
    Boolean(candidate.planSnapshot)
  );
}

function buildAgentEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/ai-actions/apply`;
}

function applyDisabledResponse(actionId: string): NextResponse<AiActionApplyResponse> {
  return NextResponse.json(
    {
      actionId,
      accepted: false,
      status: 'approval-ready',
      message: 'AI 적용은 준비되어 있지만 실제 적용 신호는 아직 비활성화되어 있습니다.',
      queuedAt: new Date().toISOString(),
      source: 'dashboard-contract',
    },
    { status: 202 },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse<AiActionApplyResponse>> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        actionId: '',
        accepted: false,
        status: 'failed',
        message: '요청 JSON을 읽을 수 없습니다.',
        source: 'dashboard-contract',
      },
      { status: 400 },
    );
  }

  if (!isApplyRequest(payload)) {
    return NextResponse.json(
      {
        actionId: '',
        accepted: false,
        status: 'failed',
        message: 'AI 적용 요청 형식이 올바르지 않습니다.',
        source: 'dashboard-contract',
      },
      { status: 400 },
    );
  }

  if (!APPLY_ENABLED) {
    return applyDisabledResponse(payload.actionId);
  }

  if (APPLY_MODE === 'db-approval') {
    const dashboardActionEndpoint = buildDashboardActionEndpoint();

    if (!dashboardActionEndpoint) {
      return NextResponse.json(
        {
          actionId: payload.actionId,
          accepted: false,
          status: 'pending-connection',
          message: 'Dashboard API 승인 엔드포인트가 아직 연결되지 않았습니다.',
          queuedAt: new Date().toISOString(),
          source: 'dashboard-contract',
        },
        { status: 202 },
      );
    }

    try {
      const dashboardResponse = await fetch(dashboardActionEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const dashboardPayload = (await dashboardResponse
        .json()
        .catch(() => null)) as Partial<AiActionApplyResponse> | null;

      if (!dashboardResponse.ok) {
        return NextResponse.json(
          {
            actionId: payload.actionId,
            accepted: false,
            status: 'failed',
            message:
              dashboardPayload?.message ??
              `Dashboard API 승인 요청 실패: ${dashboardResponse.status}`,
            source: 'dashboard-api',
          },
          { status: 502 },
        );
      }

      return NextResponse.json({
        actionId: payload.actionId,
        accepted: dashboardPayload?.accepted ?? true,
        status: dashboardPayload?.status ?? 'approval-pending',
        message: dashboardPayload?.message ?? 'AI 적용 승인 신호를 Dashboard API에 기록했습니다.',
        runId: dashboardPayload?.runId,
        queuedAt: dashboardPayload?.queuedAt ?? new Date().toISOString(),
        nextPollMs: dashboardPayload?.nextPollMs ?? 30_000,
        source: 'dashboard-api',
      });
    } catch {
      return NextResponse.json(
        {
          actionId: payload.actionId,
          accepted: false,
          status: 'failed',
          message: 'Dashboard API 승인 엔드포인트에 연결할 수 없습니다.',
          source: 'dashboard-api',
        },
        { status: 502 },
      );
    }
  }

  if (!REMEDIATION_API_URL) {
    return NextResponse.json(
      {
        actionId: payload.actionId,
        accepted: false,
        status: 'pending-connection',
        message: 'Remediation Agent API가 아직 연결되지 않아 요청 계약만 확인했습니다.',
        queuedAt: new Date().toISOString(),
        source: 'dashboard-contract',
      },
      { status: 202 },
    );
  }

  try {
    const agentResponse = await fetch(buildAgentEndpoint(REMEDIATION_API_URL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!agentResponse.ok) {
      return NextResponse.json(
        {
          actionId: payload.actionId,
          accepted: false,
          status: 'failed',
          message: `Remediation Agent 요청 실패: ${agentResponse.status}`,
          source: 'remediation-agent',
        },
        { status: 502 },
      );
    }

    const agentPayload = (await agentResponse
      .json()
      .catch(() => null)) as Partial<AiActionApplyResponse> | null;

    return NextResponse.json({
      actionId: payload.actionId,
      accepted: agentPayload?.accepted ?? true,
      status: agentPayload?.status ?? 'queued',
      message: agentPayload?.message ?? 'AI 개선 작업 요청을 Remediation Agent에 전달했습니다.',
      runId: agentPayload?.runId,
      queuedAt: agentPayload?.queuedAt ?? new Date().toISOString(),
      nextPollMs: agentPayload?.nextPollMs ?? 30_000,
      source: 'remediation-agent',
    });
  } catch {
    return NextResponse.json(
      {
        actionId: payload.actionId,
        accepted: false,
        status: 'failed',
        message: 'Remediation Agent API에 연결할 수 없습니다.',
        source: 'remediation-agent',
      },
      { status: 502 },
    );
  }
}
