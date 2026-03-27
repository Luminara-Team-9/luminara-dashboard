# 📊 벤치마킹 대시보드 (Dashboard App)

이 폴더는 데카트론 원본 사이트와 경쟁사 사이트의 성능(Lighthouse 점수, 지역별 지연시간 등)을 비교 분석하고, AI 개선안을 시각적으로 보여주는 **대시보드 웹 애플리케이션**입니다.

**⚠️ 아키텍처 규칙: FSD (Feature-Sliced Design) 엄격 적용**
이 프로젝트는 코드가 꼬이는 것을 막기 위해 FSD 방법론을 따릅니다. `/src` 폴더 안의 계층(app → pages → widgets → features → entities → shared)은 **반드시 위에서 아래로만 참조(import)**해야 합니다. 아래 계층이 위 계층을 불러오는 것은 엄격히 금지됩니다!
