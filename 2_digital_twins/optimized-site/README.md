# 🚀 AI 최적화 적용 사이트 (Optimized Site)

데이터/AI 엔지니어(유유카인)가 구축한 AI(DeepSeek-R1) 파이프라인이 제안한 **성능 개선안을 직접 코드로 적용해 보는 테스트 환경**입니다.

**적용될 주요 최적화 기술 (예정):**
- 차세대 이미지 포맷(WebP/AVIF) 자동 변환 적용
- 경로 및 컴포넌트 단위의 지연 로딩 (Lazy Loading)
- Speculation Rules API를 활용한 페이지 예측 프리로딩 (Pre-loading)
- Web Worker를 활용한 메인 스레드 연산 분산 처리

**목표:**
이 사이트에서 측정한 Lighthouse 점수가 기존 `baseline-site` 대비 LCP < 2.5초, TBT < 200ms를 달성하는지 검증합니다.
