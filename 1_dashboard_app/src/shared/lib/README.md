# Estimation formulas

추정값은 `estimationFormulas.ts`에 모아 둔다. 화면에서는 하드코딩된 퍼센트나 임의 점수를 직접 만들지 않고 이 파일의 함수를 사용한다.

## Web Vitals 기준

- LCP 목표: 2.5초 이하
- INP 목표: 200ms 이하
- CLS 목표: 0.1 이하
- 근거: Google web.dev Core Web Vitals 기준

## 진단 점수

```text
gapRatio = max(0, current - target) / target
score = clamp(0, 100, 100 - gapRatio * 55)
```

Lighthouse 원점수가 아니라, 목표 대비 초과 폭을 대시보드에서 비교하기 쉽게 바꾼 내부 판단 점수다.

## 우선순위 점수

```text
priority = metricGapRatio * affectedSessionShare * 100
affectedSessionShare = affectedSessions / totalSessions
```

성능이 나쁜 정도와 해당 단계에 걸린 세션 비중을 같이 본다. 내부 로그나 Mock 여정 데이터가 있어야 의미가 있다.

## 전환 영향 참고치

```text
referenceRelativeLift = improvementMs / 100 * 8.4%
appliedRelativeLift = min(referenceRelativeLift * 0.1, 25%)
cvrPointLift = baseCVR * appliedRelativeLift
```

Deloitte / Google의 공개 연구에서 0.1초 모바일 속도 개선과 리테일 전환율 상승 사례가 제시되었다. 그대로 예측값으로 쓰면 과장될 수 있어 현재 대시보드는 10% 보수계수와 25% 상한을 둔 참고 시나리오로만 표시한다.

## 세션/매출/이탈

```text
conversionRate = purchases / sessions * 100
revenue = purchases * averageOrderValue
dropoffRate = (currentStepSessions - nextStepSessions) / currentStepSessions * 100
```

이 값은 내부 로그, GA4, 주문 데이터가 연결되면 실측값으로 계산한다.

## 탄소/에너지 절감 참고치

```text
energyKWh =
  dataTransferGB * 0.81 * 0.75
  + dataTransferGB * 0.81 * 0.25 * 0.02

co2g = energyKWh * 442
```

Sustainable Web Design Model v3의 공개 식을 사용한다. 페이지 전송량을 대리지표로 쓰는 추정치라서 실제 배출량은 호스팅, CDN, 사용자 지역에 따라 달라진다.

## 주요 근거

- https://web.dev/articles/vitals
- https://web.dev/defining-core-web-vitals-thresholds/
- https://www.deloitte.com/ie/en/services/consulting/research/milliseconds-make-millions.html
- https://web.dev/case-studies/vitals-business-impact
- https://sustainablewebdesign.org/estimating-digital-emissions-version-3
- https://developers.thegreenwebfoundation.org/co2js/explainer/methodologies-for-calculating-website-carbon/
