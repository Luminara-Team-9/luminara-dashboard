# 🧠 데이터 & AI 파이프라인 (Data & AI Pipeline)

경쟁사 성능 데이터를 수집하고, 수집된 원시 데이터를 가공하여, 로컬 LLM(DeepSeek-R1)으로 병목 현상을 자동 분석하는 **AI 추론 및 데이터 처리 구역**입니다. (파이썬 기반)

**핵심 워크플로우:**
1. **Scrapers:** 경쟁사 웹사이트 성능 측정 데이터 수집
2. **ETL:** 복잡한 원시 Lighthouse JSON을 분석하기 쉬운 형태(Pandas/NumPy)로 정제
3. **AI Analyzer:** 정제된 데이터를 바탕으로 AI가 '디지털 셜록 홈즈'처럼 근본 원인(Root Cause)을 찾고 최적화 해결책(Fix Plans) 생성
