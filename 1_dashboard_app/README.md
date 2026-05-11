# 📊 벤치마킹 대시보드 (Dashboard App)

이 폴더는 데카트론 원본 사이트와 경쟁사 사이트의 성능(Lighthouse 점수, 지역별 지연시간 등)을 비교 분석하고, AI 개선안을 시각적으로 보여주는 **대시보드 웹 애플리케이션**입니다.

**⚠️ 아키텍처 규칙: FSD (Feature-Sliced Design) 엄격 적용**
이 프로젝트는 코드가 꼬이는 것을 막기 위해 FSD 방법론을 따릅니다. `/src` 폴더 안의 계층(app → pages → widgets → features → entities → shared)은 **반드시 위에서 아래로만 참조(import)**해야 합니다. 아래 계층이 위 계층을 불러오는 것은 엄격히 금지됩니다!

## 무료 경쟁 지표 연동

무료 경쟁 지표 화면은 경쟁사의 실제 세션 수를 확정값처럼 표시하지 않습니다. 기본 mock 데이터를 사용하되, 아래 환경변수가 있으면 자체 수집 서버의 검증된 데이터를 자동으로 병합합니다.

- `DASHBOARD_EXTERNAL_TRAFFIC_API_URL`: 팀에서 만든 수집 서버 URL입니다. 응답은 `{ "trafficSessions": { ... } }` 형태입니다.

오픈소스 중심 계획에서는 유료 트래픽 API를 필수 의존성으로 두지 않습니다.

무료로 가능한 데이터:
- 클론사이트 세션/전환 행동: self-hosted Swetrix/ClickHouse RUM으로 실측
- 경쟁사 성능/SEO: Lighthouse CI, PageSpeed Insights, CrUX API로 공개 URL 측정
- 상품 수: sitemap 또는 카테고리 페이지 크롤링으로 수집하되, robots/약관 확인 필요
- 클론사이트 상품 수: 내부 상품 카탈로그 또는 seed 데이터 기준으로 실측

주의: 경쟁사의 실제 세션 수, 전환율, 채널별 유입 비중처럼 무료 공개 데이터로 계속 자동 확보하기 어려운 항목은 기본 대시보드에서 제외하고, 별도 근거가 생길 때만 `대리지표` 또는 `Mock`으로 표시해야 합니다.
