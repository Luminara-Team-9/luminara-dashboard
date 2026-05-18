# Dashboard Data Requirements

이 문서는 Luminara 대시보드가 mock 데이터가 아니라 실제 DB/API 데이터로 동작하기 위해 필요한 데이터 구조를 정리한 것입니다.

핵심 방향:

- 웹사이트가 대시보드로 직접 데이터를 보내는 구조가 아니라, `클론/실사이트 -> Lighthouse/LHCI/RUM/로그 -> DB -> Backend API -> Dashboard` 흐름을 기준으로 한다.
- 대시보드 프론트엔드는 DB에 직접 접속하지 않고 `/api/performance`를 단일 데이터 입구로 사용한다.
- Backend API URL은 `DASHBOARD_PERFORMANCE_API_URL` 또는 `DASHBOARD_DATA_API_URL`로 연결한다.
- 브라우저 자동 갱신 주기는 `NEXT_PUBLIC_DASHBOARD_REFRESH_MS`로 조정한다. 기본값은 30초이고, `0`이면 자동 갱신을 끈다.
- Lighthouse 데이터는 현재 Phoo 작업의 자동화 파이프라인과 연결 가능하다.
- 사용자 행동, 세션, RUM, 변경 이력, AI 액션 플랜은 Lighthouse만으로는 부족하므로 별도 저장 구조가 필요하다.

## Dashboard API Contract

대시보드가 최종적으로 받는 통합 API 응답은 `src/shared/lib/types.ts`의 `PerformanceApiResponse` 형태를 따른다.

```ts
interface PerformanceApiResponse {
  timestamp: string;
  executiveSummary: ExecutiveSummary;
  businessMetrics?: BusinessMetrics;
  benchmarks: BenchmarkEntry[];
  pageMetrics: PageBenchmarkEntry[];
  trends: Trends;
  rum: RUM;
  aiFixPlans: AiFixPlan[];
}
```

Backend API는 DB 테이블을 그대로 노출하기보다, dashboard가 바로 그릴 수 있도록 위 형태로 가공해서 내려주는 것이 좋다.

최소 JSON 예시:

```json
{
  "timestamp": "2026-05-13T08:00:00.000Z",
  "executiveSummary": {
    "globalScore": 72,
    "status": "needs-improvement",
    "baselineAnnualRevenue": 0,
    "seoHealth": { "rankPercentile": 0, "estimatedChange": 0 },
    "carbonFootprint": { "gramsPerPageView": 0, "savedGrams": 0 }
  },
  "businessMetrics": {},
  "benchmarks": [],
  "pageMetrics": [],
  "trends": { "labels": [], "datasets": [], "releases": [] },
  "rum": { "regionalData": [], "userJourney": [] },
  "aiFixPlans": []
}
```

## 자동 반영 원칙

대시보드는 값을 직접 만들어 저장하지 않고, Backend API가 내려주는 최신 응답을 기준으로 다시 그린다. 관측 파이프라인이나 AI 분석 결과가 DB/API에 반영되면 다음 갱신 주기부터 화면도 자동으로 바뀌어야 한다.

- 경쟁사 벤치마킹: `benchmarks`, `pageMetrics` 배열에 브랜드가 추가되면 브랜드 카드, 비교군 개수, 순위, 평균 대비 문구가 자동으로 재계산된다.
- 사용자 여정: `rum.sessionPaths[].path` 배열의 길이만큼 경로 박스가 그대로 표시된다. 예를 들어 2단계 경로는 박스 2개, 5단계 경로는 박스 5개로 표시된다.
- 구매 횟수와 전환 지표: `businessMetrics.acquisitionChannels[].purchases`, `deviceSegments[].purchases`, `rum.userJourney`의 구매 완료 세션이 바뀌면 화면 값이 자동 변경된다.
- 성능 추세: `trends.labels`, `trends.datasets`, `trends.releases`가 바뀌면 그래프, 변경 이력, 변경 전후 성능 변화가 자동 변경된다.
- 보조 분석: `rum.regionalData`가 바뀌면 지역/통신사 분포와 순위가 자동 변경된다.
- AI 액션 플랜: `aiFixPlans` 배열이 바뀌면 카드가 추가/수정/삭제된다. AI가 생성한 상세 설명과 코드 수정안은 `aiFixPlans[].decision` 필드를 우선 사용한다.

`aiFixPlans[].decision` 예시:

```json
{
  "problem": "LLM이 측정 결과를 보고 생성한 문제 제목",
  "area": "LLM이 분류한 영향 영역",
  "reason": "사용자가 바로 이해할 수 있는 문제 설명",
  "evidence": "Lighthouse, RUM, 로그, 리소스 분석에서 확인한 근거",
  "fix": "적용할 해결 방법",
  "codeTitle": "코드 수정안 제목",
  "beforeCode": "수정 전 코드 또는 설정",
  "afterCode": "수정 후 코드 또는 설정",
  "conclusion": "적용 후 기대되는 사용자/운영 관점 결론",
  "source": "LLM remediation pipeline",
  "generatedAt": "2026-05-13T08:00:00.000Z"
}
```

## 1. Lighthouse Performance Audit

대시보드 사용 위치:

- 현재 성능 진단
- 경쟁사 벤치마킹
- 성능 추세
- AI 최적화 액션 플랜
- 탄소/에너지 절감 추정

필요 데이터:

| Field | Description | Required |
| --- | --- | --- |
| test_id | Lighthouse 측정 ID | Yes |
| playwright_run_id | 한 번의 자동화 실행 묶음 ID | Yes |
| url | 측정 대상 URL | Yes |
| site_type | target, competitor, clone 등 | Yes |
| competitor_name | 경쟁사 이름. target이면 null | No |
| page_type | home, category, product, cart, checkout 등 | Yes |
| device_type | desktop, mobile | Yes |
| network_profile | WiFi, 4G, slow-4G 등 | No |
| run_number | 반복 측정 번호 | Yes |
| timestamp | 측정 시각 | Yes |
| performance_score | Lighthouse Performance score | Yes |
| accessibility_score | Lighthouse Accessibility score | Yes |
| best_practices_score | Lighthouse Best Practices score | Yes |
| seo_score | Lighthouse SEO score | Yes |
| lcp_ms | Largest Contentful Paint | Yes |
| fcp_ms | First Contentful Paint | Yes |
| cls_score | Cumulative Layout Shift | Yes |
| tbt_ms | Total Blocking Time | Yes |
| si_ms | Speed Index | Yes |
| tti_ms | Time to Interactive | No |
| ttfb_ms | Time to First Byte | No |
| inp_ms | Interaction to Next Paint. Lighthouse에서 없을 수 있음 | No |
| total_requests | 전체 요청 수 | Yes |
| page_size_kb | 전체 전송 크기 | Yes |
| js_size_kb | JS 전송 크기 | Yes |
| css_size_kb | CSS 전송 크기 | Recommended |
| image_size_kb | 이미지 전송 크기 | Recommended |

현재 Phoo 작업과의 관계:

- `4_automation_tests/lighthouse-runner/run_audit_pipeline.sh`가 Lighthouse JSON을 생성한다.
- `insert_results.js`가 `lighthouse_runs`, `lighthouse_raw_reports`에 저장하도록 작성되어 있다.
- 현재 스크립트에는 `--only-categories=performance`가 있어 accessibility, best-practices, seo 점수는 빠질 수 있다.
- 대시보드에는 SEO/접근성/Best Practices도 필요하므로 아래 중 하나가 필요하다.

```bash
# Option A: 모든 기본 category 측정
# --only-categories 옵션 제거

# Option B: 필요한 category 명시
--only-categories=performance,accessibility,best-practices,seo
```

## 2. Lighthouse Opportunities

대시보드 사용 위치:

- AI 최적화 액션 플랜
- 상세 모달의 문제 원인/개선안

필요 데이터:

| Field | Description | Required |
| --- | --- | --- |
| id | Opportunity row ID | Yes |
| test_id | 연결된 lighthouse_runs.test_id | Yes |
| opportunity_id | Lighthouse audit id | Yes |
| title | 문제 제목 | Yes |
| description | Lighthouse 설명 | Yes |
| savings_ms | 예상 절감 시간 | No |
| savings_bytes | 예상 절감 byte | No |
| severity | high, medium, low | Recommended |
| affected_metric | LCP, TBT, CLS 등 | Recommended |
| created_at | 저장 시각 | Yes |

## 3. Raw Lighthouse Report

대시보드 사용 위치:

- 추후 재가공
- 누락 지표 보완
- AI/RAG 분석용 원본 보관

필요 데이터:

| Field | Description | Required |
| --- | --- | --- |
| id | Raw report ID | Yes |
| test_id | 연결된 lighthouse_runs.test_id | Yes |
| raw_json | Lighthouse 원본 JSON | Yes |
| created_at | 저장 시각 | Yes |

## 4. User Sessions

대시보드 사용 위치:

- Traffic / Session Insight
- 유입 채널 분석
- 디바이스별 성과
- 사용자 여정 분석

필요 데이터:

| Field | Description | Required |
| --- | --- | --- |
| session_id | 익명 세션 ID | Yes |
| visitor_id | 익명 방문자 ID | Recommended |
| started_at | 세션 시작 시각 | Yes |
| ended_at | 세션 종료 시각 | No |
| landing_url | 첫 진입 URL | Yes |
| exit_url | 마지막 URL | No |
| referrer | 유입 referrer | No |
| source_channel | direct, search, social, referral 등 | Recommended |
| device_type | desktop, mobile, tablet | Recommended |
| browser | Chrome, Safari 등 | Recommended |
| os | Windows, macOS, Android, iOS 등 | Recommended |
| country | 국가 | No |
| region | 지역 | No |
| network_type | 4G, WiFi 등. 수집 가능할 때만 | No |
| pageview_count | 세션 내 페이지뷰 수 | Recommended |
| duration_sec | 세션 지속 시간 | Recommended |

현재 상태:

- 클론 사이트 코드에는 Swetrix tracker 흔적이 있다.
- 다만 `TEMP_PROJECT_ID`가 사용되고 있고 수집 서버 응답 여부가 확정되지 않았다.
- 세션/방문자/유입 채널을 안정적으로 대시보드에 쓰려면 Swetrix 또는 자체 로그가 DB에 저장되어야 한다.

## 5. User Journey Events

대시보드 사용 위치:

- 사용자 여정
- 퍼널 전환율
- 장바구니/결제 이탈 분석

필요 이벤트:

- `page_view`
- `search`
- `product_view`
- `add_to_cart`
- `cart_view`
- `checkout_click`
- `checkout_abandon`
- `purchase` 또는 `mock_purchase`

필요 데이터:

| Field | Description | Required |
| --- | --- | --- |
| event_id | 이벤트 ID | Yes |
| session_id | 연결된 세션 ID | Yes |
| event_name | 이벤트 이름 | Yes |
| occurred_at | 발생 시각 | Yes |
| page_url | 발생 페이지 | Yes |
| page_type | home, search, product, cart 등 | Recommended |
| product_id | 상품 관련 이벤트일 때 | No |
| product_name | 상품 관련 이벤트일 때 | No |
| category | 상품/검색 카테고리 | No |
| search_query | 검색 이벤트일 때 | No |
| cart_value | 장바구니/결제 이벤트일 때 | No |
| quantity | 상품 수량 | No |
| metadata | 추가 JSON | No |

현재 상태:

- 클론 사이트에는 `localStorage` 기반 장바구니 동작이 있다.
- 하지만 `add_to_cart`, `checkout_click` 같은 행동 이벤트를 Swetrix/DB로 보내는 코드는 별도로 필요하다.
- 따라서 현재는 페이지 이동 정도만 추정 가능하고, 정확한 퍼널은 아직 부족하다.
- Dashboard API는 아래 이벤트 이름이 ClickHouse `analytics.events.event_name`에 들어오면 자동으로 `rum.userJourney`와 `rum.sessionPaths`로 변환한다.

Dashboard API 수신 이벤트 계약:

| event_name | Dashboard label | Page type |
| --- | --- | --- |
| `page_view` | 사이트 진입 | main |
| `search` | 검색 | main |
| `product_view` | 상품 상세 조회 | product |
| `add_to_cart` | 장바구니 담기 | product |
| `cart_view` | 장바구니 | checkout |
| `checkout_click` 또는 `checkout_start` | 결제 진입 | checkout |
| `purchase`, `mock_purchase`, `purchase_complete` | 구매 완료 | checkout |

## 6. Real User Monitoring Web Vitals

대시보드 사용 위치:

- 실제 사용자 환경 성능
- 지역/디바이스/브라우저별 성능 차이

필요 데이터:

| Field | Description | Required |
| --- | --- | --- |
| rum_id | RUM row ID | Yes |
| session_id | 연결된 세션 ID | Recommended |
| url | 측정 URL | Yes |
| measured_at | 측정 시각 | Yes |
| lcp_ms | 실제 사용자 LCP | Yes |
| cls_score | 실제 사용자 CLS | Yes |
| inp_ms | 실제 사용자 INP | Yes |
| fcp_ms | 실제 사용자 FCP | Recommended |
| ttfb_ms | 실제 사용자 TTFB | Recommended |
| device_type | desktop, mobile 등 | Recommended |
| browser | 브라우저 | Recommended |
| region | 지역 | No |
| network_type | 네트워크 타입 | No |

현재 상태:

- Lighthouse는 lab data이고 RUM은 field data이다.
- Swetrix 기본 pageview만으로 Web Vitals가 충분히 저장되는지 확인 필요하다.
- 안정적인 대시보드를 위해서는 `web-vitals` 기반 이벤트 전송을 별도로 두는 것이 좋다.

## 7. Change History

대시보드 사용 위치:

- 성능 추세 그래프에서 특정 시점 클릭 시 변경 사항 표시
- 변경 전후 성능 비교

필요 데이터:

| Field | Description | Required |
| --- | --- | --- |
| change_id | 변경 이력 ID | Yes |
| changed_at | 변경 시각 | Yes |
| commit_hash | Git commit hash | Recommended |
| branch_name | 배포/측정 branch | Recommended |
| release_label | 배포 버전 또는 태그 | No |
| service_name | dashboard, clone, automation 등 | Recommended |
| summary | 변경 요약 | Yes |
| author | 작업자 | No |
| related_run_id | 연결된 Lighthouse run | No |

현재 상태:

- Lighthouse timestamp만으로 추세는 가능하다.
- 그래프 클릭 시 "그때 무슨 변경이 있었는지"까지 보여주려면 별도 변경 이력 저장이 필요하다.

## 8. AI Action Plans

대시보드 사용 위치:

- AI 최적화 액션 플랜 카드
- 상세 모달
- 적용 상태 관리

필요 데이터:

| Field | Description | Required |
| --- | --- | --- |
| action_id | 액션 ID | Yes |
| test_id | 기준 Lighthouse 측정 ID | Recommended |
| opportunity_id | 연결된 Lighthouse opportunity | Recommended |
| title | 액션 제목 | Yes |
| problem_summary | 문제 요약 | Yes |
| recommendation | 개선 제안 | Yes |
| expected_impact_ms | 예상 절감 시간 | No |
| expected_impact_score | 예상 점수 개선 | No |
| priority | high, medium, low | Yes |
| status | pending, applied, ignored 등 | Yes |
| code_example | 예시 코드 | No |
| created_at | 생성 시각 | Yes |
| updated_at | 수정 시각 | No |

## 9. RAG Documents

대시보드 사용 위치:

- AI 액션 플랜 설명 보강
- 성능 개선 근거 문서 검색

필요 데이터:

| Field | Description | Required |
| --- | --- | --- |
| id | 문서 ID | Yes |
| content | 문서 본문 | Yes |
| embedding | pgvector embedding | Yes |
| source | Lighthouse, docs, team-note 등 | Yes |
| source_url | 원문 URL | No |
| related_metric | LCP, CLS, TBT 등 | No |
| created_at | 저장 시각 | Yes |

현재 상태:

- 팀원이 제안한 `rag_documents`는 방향이 맞다.
- 대시보드와 연결하려면 `source_url`, `related_metric` 정도가 추가되면 좋다.

## Minimum Schema Needed First

우선순위 1:

- `playwright_runs`
- `lighthouse_runs`
- `lighthouse_raw_reports`
- `lighthouse_opportunities`

우선순위 2:

- `user_sessions`
- `user_events`
- `rum_web_vitals`

우선순위 3:

- `change_history`
- `ai_action_plans`
- `rag_documents`

## Current Check Summary

- Lighthouse 실행과 JSON 생성은 Phoo 작업공간에서 확인됨.
- Lighthouse JSON에는 실제 performance, LCP, TBT, CLS 값이 들어 있음.
- DB 컨테이너 인스턴스는 떠 있지만 PostgreSQL 접속은 현재 응답하지 않음.
- 따라서 현재 문제는 Lighthouse 측정 자체보다 DB 준비/접속/스키마 적용 쪽으로 보인다.
- DB가 준비되면 Phoo 파이프라인의 insert 단계와 이 문서의 schema 요구사항을 맞춰야 한다.
