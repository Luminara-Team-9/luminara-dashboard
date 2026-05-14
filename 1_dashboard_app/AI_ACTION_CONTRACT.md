# AI Action Contract

> 상태: 초안 / 언제든지 수정 가능
>
> 이 문서는 현재 대시보드 관점에서 예상한 AI Action 연동 초안이다. 팀원 설명, 실제 AI 파이프라인 구조, Qwen/Remediation Agent 구현 방식에 따라 일부 또는 전체를 다시 설계할 수 있다. 다른 AI나 팀원이 검토하면서 더 적절한 입력/출력 구조가 있으면 이 문서를 수정해도 된다.

이 문서는 대시보드가 AI/Remediation Agent와 주고받는 최소 계약을 정리한다.

대시보드는 AI가 직접 사이트를 탐색하거나 코드를 수정하지 않는다. AI/자동화 파이프라인이 만든 `aiFixPlans`를 표시하고, 사용자가 `적용하기`를 누르면 Remediation Agent에 승인 신호를 보낸다.

## 1. 대시보드가 받는 AI 결과

Backend API는 `PerformanceApiResponse.aiFixPlans[]`에 AI 분석 결과를 넣어준다.

```json
{
  "id": "fix-product-lcp-001",
  "brand": "Decathlon",
  "metricKey": "lcp",
  "title": "상품 상세 첫 화면이 늦게 표시됨",
  "description": "상품 대표 이미지가 늦게 표시되어 탐색 시작이 지연됩니다.",
  "priority": "high",
  "estimatedImpact": "상품 확인 전 이탈 가능성을 줄이는 개선입니다.",
  "effort": "medium",
  "impactScore": 8,
  "remediationStatus": "queued",
  "remediationRunId": "remediation-run-104",
  "remediationMessage": "AI 개선 작업 요청을 접수했습니다.",
  "decision": {
    "problem": "상품 상세 첫 화면이 늦게 표시됨",
    "area": "상품 상세 페이지",
    "reason": "LCP가 목표보다 높고 이미지 최적화 여지가 큽니다.",
    "evidence": "LCP 4.1s, 목표 2.5s, 이미지 절감 가능 420KB",
    "fix": "대표 이미지를 WebP로 전환하고 첫 이미지를 우선 로딩합니다.",
    "codeTitle": "상품 대표 이미지 우선 로딩",
    "beforeCode": "...",
    "afterCode": "...",
    "conclusion": "상품을 보기 전 이탈 가능성을 줄일 수 있습니다.",
    "source": "Qwen remediation pipeline",
    "generatedAt": "2026-05-14T09:00:00.000Z"
  }
}
```

## 2. 대시보드가 보내는 적용 요청

사용자가 AI 카드 모달에서 `적용하기`를 누르면 대시보드는 `POST /api/ai-actions/apply`로 아래 요청을 보낸다.

이 API는 `DASHBOARD_REMEDIATION_API_URL` 또는 `REMEDIATION_AGENT_API_URL`이 설정되어 있으면 `{baseUrl}/ai-actions/apply`로 요청을 전달한다. Agent URL이 없으면 요청 형식만 검증하고 `pending-connection` 상태를 돌려준다.

```json
{
  "actionId": "fix-product-lcp-001",
  "requestedAt": "2026-05-14T09:05:00.000Z",
  "source": "dashboard",
  "action": "apply",
  "planSnapshot": {
    "id": "fix-product-lcp-001",
    "brand": "Decathlon",
    "metricKey": "lcp",
    "title": "상품 상세 첫 화면이 늦게 표시됨",
    "priority": "high",
    "estimatedImpact": "상품 확인 전 이탈 가능성을 줄이는 개선입니다.",
    "decision": {}
  }
}
```

## 3. Remediation Agent 응답

Agent는 아래 형태로 응답하면 된다.

```json
{
  "actionId": "fix-product-lcp-001",
  "accepted": true,
  "status": "queued",
  "message": "AI 개선 작업 요청을 접수했습니다.",
  "runId": "remediation-run-104",
  "queuedAt": "2026-05-14T09:05:01.000Z",
  "nextPollMs": 30000,
  "source": "remediation-agent"
}
```

`accepted`가 `true`이면 대시보드는 요청 전송 상태로 표시한다. 실제 개선 완료 여부는 다음 Lighthouse/RUM/AI 분석 사이클에서 DB/API가 갱신한 `aiFixPlans`, `trends`, `benchmarks`, `pageMetrics`를 다시 받아 판단한다.
