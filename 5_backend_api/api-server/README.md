# 📡 API 서버 (API Server)

프론트엔드 대시보드(1번 폴더)가 화면을 그릴 수 있도록 **필요한 데이터를 전달해 주는 웨이터 역할**을 합니다.

**무엇이 들어가나요?**
- 대시보드가 "경쟁사 점수 줘!", "통신사별 딜레이 시간 줘!"라고 요청할 때 응답하는 REST API 엔드포인트 코드 (Node.js 또는 Python FastAPI 등)
- DB에서 데이터를 꺼내와 프론트엔드가 정의한 규격(`0_shared_packages/types`)에 맞게 포장해서 넘겨주는 로직

## Dashboard Performance API

현재 구현된 첫 엔드포인트는 PostgreSQL `core_db`를 읽어서 대시보드의
`PerformanceApiResponse` 형태로 변환합니다. DB에는 `SELECT`만 수행합니다.

```bash
PGHOST=127.0.0.1 \
PGPORT=5432 \
PGUSER=lumin_admin \
PGPASSWORD=<local-password> \
CORE_PGDATABASE=core_db \
LHCI_PGDATABASE=lhci \
DASHBOARD_API_PORT=3024 \
pnpm --dir 5_backend_api/api-server start
```

확인:

```bash
curl http://127.0.0.1:3024/health
curl http://127.0.0.1:3024/dashboard/performance
```

대시보드에서 실제 API를 사용하려면 대시보드 실행 환경에 아래 값을 설정합니다.

```bash
DASHBOARD_PERFORMANCE_API_URL=http://127.0.0.1:3024/dashboard/performance
```

주의:
- 실제 DB 비밀번호는 Git에 올리지 않습니다.
- 이 API는 현재 `lhci.runs`에서 Lighthouse 원본 report를 읽고,
  `core_db.fix_plans`에서 AI 개선안을 read-only로 조회합니다.
- RUM/session 데이터가 준비되기 전까지 해당 영역은 빈 배열 또는 연결 대기 상태로 내려갑니다.
