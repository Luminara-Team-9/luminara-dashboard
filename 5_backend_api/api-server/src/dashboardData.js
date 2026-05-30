const TARGET_LIGHTHOUSE_SCORE = 90;
const DEFAULT_RUM_PROJECT_IDS = ['n9FlE09mPFlv', '6MZNYXghl1v8'];
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL
  ?? process.env.SWETRIX_CLICKHOUSE_URL
  ?? `http://${process.env.CLICKHOUSE_HOST ?? '127.0.0.1'}:${process.env.CLICKHOUSE_PORT ?? 8123}`;
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE ?? 'analytics';
const CLICKHOUSE_EVENTS_TABLE = process.env.CLICKHOUSE_EVENTS_TABLE ?? 'analytics.events';
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER;
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD;
const RUM_LIVE_WINDOW_SECONDS = 90;
const RUM_DELAYED_WINDOW_SECONDS = 15 * 60;
const JOURNEY_SESSION_GAP_MS = 30 * 60 * 1000;

const METRIC_TARGETS = {
  lcp: { target: 2.5, unit: 's', label: 'LCP' },
  cls: { target: 0.1, unit: 'score', label: 'CLS' },
  inp: { target: 200, unit: 'ms', label: 'INP' },
  tbt: { target: 200, unit: 'ms', label: 'TBT' },
  fcp: { target: 1.8, unit: 's', label: 'FCP' },
  speedIndex: { target: 3.4, unit: 's', label: 'Speed Index' },
  assetSize: { target: 450, unit: 'KB', label: 'Asset Size' },
};

const RANGE_OPTIONS = {
  '15m': { clickhouse: '15 MINUTE', label: '최근 15분' },
  '1h': { clickhouse: '1 HOUR', label: '최근 1시간' },
  '24h': { clickhouse: '24 HOUR', label: '최근 24시간' },
  '7d': { clickhouse: '7 DAY', label: '최근 7일' },
  all: { clickhouse: null, label: '전체 기간' },
};

const CUSTOM_EVENT_FLOW = [
  { event: "page_view", label: "사이트 진입", pageType: "main" },
  { event: "search", label: "검색", pageType: "main" },
  { event: "product_view", label: "상품 상세 조회", pageType: "product" },
  { event: "add_to_cart", label: "장바구니 담기", pageType: "product" },
  { event: "cart_view", label: "장바구니", pageType: "checkout" },
  { event: "checkout_click", label: "결제 진입", pageType: "checkout" },
  { event: "purchase", label: "구매 완료", pageType: "checkout" },
];

const CUSTOM_EVENT_ALIASES = {
  page_view: ["page_view"],
  product_view: ["product_view", "view_product", "product_detail_view"],
  add_to_cart: ["add_to_cart", "click_add_to_cart"],
  cart_view: ["cart_view", "view_cart"],
  purchase: ["purchase", "mock_purchase", "purchase_complete"],
  checkout_click: ["checkout_click", "checkout_start"],
};

const INTERNAL_REVENUE_MODEL_SOURCE = '내부 기준 데이터';
const INTERNAL_REVENUE_MODEL_PERIOD = '2026-04-23 ~ 2026-05-20';
const INTERNAL_REVENUE_MODEL_ROWS = [
  { channel: 'Paid Search', sessions: 194243, engagedSessions: 155242, firstVisits: 95942, avgEngagementTime: 169.9344584, eventCount: 6772093, keyEvents: 57360, sessionKeyEventRate: 0.083462467, revenue: 416342659.1 },
  { channel: 'Organic Search', sessions: 41095, engagedSessions: 28754, firstVisits: 21734, avgEngagementTime: 111.3419394, eventCount: 1036063, keyEvents: 8763, sessionKeyEventRate: 0.0569169, revenue: 56674993.01 },
  { channel: 'Paid Social', sessions: 156706, engagedSessions: 80112, firstVisits: 78128, avgEngagementTime: 39.46342195, eventCount: 1805847, keyEvents: 9079, sessionKeyEventRate: 0.020216201, revenue: 50434499.01 },
  { channel: 'Direct', sessions: 93098, engagedSessions: 32363, firstVisits: 68368, avgEngagementTime: 33.13961632, eventCount: 946173, keyEvents: 8623, sessionKeyEventRate: 0.029603214, revenue: 47156867.03 },
  { channel: 'Unassigned', sessions: 46652, engagedSessions: 2938, firstVisits: 4120, avgEngagementTime: 76.34860242, eventCount: 754127, keyEvents: 5819, sessionKeyEventRate: 0.04070565, revenue: 40183562.02 },
  { channel: 'Referrals', sessions: 22095, engagedSessions: 14386, firstVisits: 14880, avgEngagementTime: 104.3348721, eventCount: 753519, keyEvents: 7145, sessionKeyEventRate: 0.073636569, revenue: 39986090.99 },
  { channel: 'Naver', sessions: 23522, engagedSessions: 14534, firstVisits: 11912, avgEngagementTime: 68.28594507, eventCount: 382929, keyEvents: 3968, sessionKeyEventRate: 0.042130771, revenue: 18822147 },
  { channel: 'CRM / Email', sessions: 808, engagedSessions: 518, firstVisits: 199, avgEngagementTime: 76.60519802, eventCount: 13977, keyEvents: 275, sessionKeyEventRate: 0.090346535, revenue: 936400.0008 },
  { channel: 'Affiliates', sessions: 212, engagedSessions: 149, firstVisits: 110, avgEngagementTime: 90.18396226, eventCount: 4549, keyEvents: 34, sessionKeyEventRate: 0.047169811, revenue: 357207.998 },
  { channel: 'Offline / QR', sessions: 192, engagedSessions: 95, firstVisits: 92, avgEngagementTime: 37.05729167, eventCount: 2550, keyEvents: 27, sessionKeyEventRate: 0.03125, revenue: 149700 },
  { channel: 'AI', sessions: 115, engagedSessions: 78, firstVisits: 89, avgEngagementTime: 45.53043478, eventCount: 1140, keyEvents: 9, sessionKeyEventRate: 0.052173913, revenue: 64799.99997 },
];

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}

function sumValues(rows, selector) {
  return rows.reduce((sum, row) => sum + toNumber(selector(row)), 0);
}

function getInternalRevenueCoefficients() {
  const sessions = sumValues(INTERNAL_REVENUE_MODEL_ROWS, (row) => row.sessions);
  const engagedSessions = sumValues(INTERNAL_REVENUE_MODEL_ROWS, (row) => row.engagedSessions);
  const firstVisits = sumValues(INTERNAL_REVENUE_MODEL_ROWS, (row) => row.firstVisits);
  const eventCount = sumValues(INTERNAL_REVENUE_MODEL_ROWS, (row) => row.eventCount);
  const keyEvents = sumValues(INTERNAL_REVENUE_MODEL_ROWS, (row) => row.keyEvents);
  const revenue = sumValues(INTERNAL_REVENUE_MODEL_ROWS, (row) => row.revenue);
  const engagementSeconds = sumValues(INTERNAL_REVENUE_MODEL_ROWS, (row) => row.sessions * row.avgEngagementTime);
  const keyEventSessions = sumValues(INTERNAL_REVENUE_MODEL_ROWS, (row) => row.sessions * row.sessionKeyEventRate);

  return {
    sessions,
    revenue,
    engagementRate: sessions > 0 ? engagedSessions / sessions : 0,
    newVisitRate: sessions > 0 ? firstVisits / sessions : 0,
    avgEngagementSecondsPerSession: sessions > 0 ? engagementSeconds / sessions : 0,
    eventsPerSession: sessions > 0 ? eventCount / sessions : 0,
    keyEventSessionRate: sessions > 0 ? keyEventSessions / sessions : 0,
    revenuePerSession: sessions > 0 ? revenue / sessions : 0,
    revenuePerThousandSessions: sessions > 0 ? (revenue / sessions) * 1000 : 0,
    revenuePerEngagedSession: engagedSessions > 0 ? revenue / engagedSessions : 0,
    revenuePerEngagementMinute: engagementSeconds > 0 ? revenue / (engagementSeconds / 60) : 0,
    revenuePerEvent: eventCount > 0 ? revenue / eventCount : 0,
    revenuePerKeyEvent: keyEvents > 0 ? revenue / keyEvents : 0,
  };
}

function buildInternalRevenueModel(summary) {
  const coefficients = getInternalRevenueCoefficients();
  const sessions = toNumber(summary.sessions);
  const pageViews = toNumber(summary.page_views);
  const events = toNumber(summary.total_events);
  const purchaseSessions = toNumber(summary.purchase_sessions);
  const baselineEngagementMinutes = (sessions * coefficients.avgEngagementSecondsPerSession) / 60;

  return {
    source: INTERNAL_REVENUE_MODEL_SOURCE,
    period: INTERNAL_REVENUE_MODEL_PERIOD,
    confidence: 'estimated',
    currentInputs: {
      sessions,
      pageViews,
      events,
      purchaseSessions,
      baselineEngagementMinutes: round(baselineEngagementMinutes, 1),
      measuredEngagementMinutes: null,
      eventSource: 'Swetrix RUM event stream',
    },
    coefficients: {
      revenuePerSession: round(coefficients.revenuePerSession, 2),
      revenuePerThousandSessions: round(coefficients.revenuePerThousandSessions, 0),
      revenuePerEngagedSession: round(coefficients.revenuePerEngagedSession, 2),
      revenuePerEngagementMinute: round(coefficients.revenuePerEngagementMinute, 2),
      revenuePerEvent: round(coefficients.revenuePerEvent, 2),
      revenuePerKeyEvent: round(coefficients.revenuePerKeyEvent, 2),
      engagementRate: round(coefficients.engagementRate * 100, 2),
      newVisitRate: round(coefficients.newVisitRate * 100, 2),
      avgEngagementSecondsPerSession: round(coefficients.avgEngagementSecondsPerSession, 1),
      eventsPerSession: round(coefficients.eventsPerSession, 2),
      keyEventSessionRate: round(coefficients.keyEventSessionRate * 100, 2),
    },
    estimates: [
      {
        key: 'sessions',
        label: '세션 기준 예상 수익',
        value: round(sessions * coefficients.revenuePerSession, 0),
        inputLabel: '현재 실측 세션',
        inputValue: sessions,
        formula: '현재 세션 x 내부 세션당 수익 기준',
        confidence: 'estimated',
      },
      {
        key: 'baseline_engagement_time',
        label: '참여시간 기준 예상 수익',
        value: round(baselineEngagementMinutes * coefficients.revenuePerEngagementMinute, 0),
        inputLabel: '기준 참여분',
        inputValue: round(baselineEngagementMinutes, 1),
        formula: '현재 세션 x 내부 평균 참여시간 x 내부 참여 1분당 수익 기준',
        confidence: 'proxy',
      },
      {
        key: 'events',
        label: '이벤트 기준 예상 수익',
        value: round(events * coefficients.revenuePerEvent, 0),
        inputLabel: '현재 수집 이벤트',
        inputValue: events,
        formula: '현재 이벤트 수 x 내부 이벤트당 수익 기준',
        confidence: 'proxy',
      },
    ],
    referenceBenchmarks: [
      {
        label: '동종 업계 비교 방식',
        value: '중앙값 · 25/75분위',
        note: '공식 분석 도구의 벤치마크 비교 방식',
        source: 'Google Analytics Benchmarking',
      },
      {
        label: '참여 세션 기준',
        value: '10초+ · 핵심 행동 · 2+ 페이지',
        note: '참여율/이탈률 해석 기준',
        source: 'Google Analytics',
      },
      {
        label: '웹 성능 기준',
        value: 'LCP 2.5s · INP 200ms · CLS 0.1',
        note: '사용자 경험 품질 판단 기준',
        source: 'Web Vitals',
      },
      {
        label: '모바일 로딩 위험선',
        value: '3초 초과 주의',
        note: '모바일 사용자의 이탈 위험 설명 기준',
        source: 'Google mobile speed research',
      },
    ],
    caveat: '현재 매출이 아니라 내부 기준 데이터에서 도출한 수익 계수를 현재 실측값에 적용한 기준선입니다.',
  };
}

function resolveRange(value) {
  return RANGE_OPTIONS[value] ? value : 'all';
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function getRumProjectIds() {
  const raw = process.env.SWETRIX_PROJECT_IDS;
  if (raw) {
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [
    process.env.SWETRIX_BASELINE_PID,
    process.env.SWETRIX_OPTIMISED_PID,
  ].filter(Boolean).concat(DEFAULT_RUM_PROJECT_IDS).filter((value, index, array) => array.indexOf(value) === index);
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildRumTimeFilter(options = {}) {
  const conditions = [];
  const from = isIsoDate(options.from) ? options.from : null;
  const to = isIsoDate(options.to) ? options.to : null;

  if (from) conditions.push("created >= toDateTime(" + sqlString(from + " 00:00:00") + ")");
  if (to) conditions.push("created < toDateTime(" + sqlString(to + " 00:00:00") + ") + INTERVAL 1 DAY");

  if (conditions.length > 0) {
    return { clause: "AND " + conditions.join(" AND "), label: (from || "처음") + " ~ " + (to || "오늘") };
  }

  const range = RANGE_OPTIONS[resolveRange(options.range)];
  return {
    clause: range.clickhouse ? "AND created >= now() - INTERVAL " + range.clickhouse : "",
    label: range.label,
  };
}

async function queryClickHouse(query) {
  const headers = { 'content-type': 'text/plain; charset=utf-8' };
  if (CLICKHOUSE_USER || CLICKHOUSE_PASSWORD) {
    headers.authorization = `Basic ${Buffer.from(`${CLICKHOUSE_USER ?? ''}:${CLICKHOUSE_PASSWORD ?? ''}`).toString('base64')}`;
  }

  const response = await fetch(CLICKHOUSE_URL, {
    method: 'POST',
    headers,
    body: `${query.trim()}\nFORMAT JSONEachRow`,
  });

  if (!response.ok) {
    throw new Error(`ClickHouse query failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  if (!text.trim()) return [];
  return text.trim().split('\n').map((line) => JSON.parse(line));
}

function msToSeconds(value) {
  return round(toNumber(value) / 1000, 2);
}

function normalizeBrand(row) {
  if (row.site_type === 'target' || row.site_type === 'decathlon') return 'Decathlon';
  const name = row.competitor_name || row.site_type || 'Competitor';
  const lower = name.toLowerCase();
  if (lower === 'nike') return 'Nike Korea';
  if (lower === 'ssg') return 'SSG';
  if (lower === 'fila') return 'Fila';
  if (lower === 'underarmour' || lower === 'under armour' || lower === 'under-armour') return 'Under Armour';
  if (lower === 'unknown') return 'Unknown Site';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function pageTypeFromUrl(url) {
  const value = String(url ?? '').toLowerCase();
  let pageType = 'main';
  if (value.includes('/cart')) pageType = 'cart';
  else if (value.includes('/checkout') || value.includes('/payment')) pageType = 'checkout';
  else if (value.includes('/products/') || value.includes('/product/') || value.includes('/p/')) pageType = 'product';
  else if (value.includes('/c/') || value.includes('category')) pageType = 'category';

  return pageType;
}

function classifyUrl(url) {
  const value = String(url ?? '').toLowerCase();
  const pageType = pageTypeFromUrl(value);

  if (
    value.includes('localhost:port') ||
    value.includes('localhost:3003') ||
    value.includes('127.0.0.1:3003') ||
    value.includes('155.230.135.209:3003')
  ) {
    return { site_type: 'target', competitor_name: null, page_type: pageType };
  }

  if (value.includes('decathlon.co.kr') || value.includes('decathlon.com')) {
    return { site_type: 'decathlon', competitor_name: null, page_type: pageType };
  }

  if (value.includes('nike.com')) {
    return { site_type: 'competitor', competitor_name: 'nike', page_type: pageType };
  }

  if (value.includes('ssg.com')) {
    return { site_type: 'competitor', competitor_name: 'ssg', page_type: pageType };
  }

  if (value.includes('fila.co.kr') || value.includes('fila.com')) {
    return { site_type: 'competitor', competitor_name: 'fila', page_type: pageType };
  }

  if (value.includes('underarmour.co.kr') || value.includes('underarmour.com')) {
    return { site_type: 'competitor', competitor_name: 'underarmour', page_type: pageType };
  }

  return { site_type: 'competitor', competitor_name: 'unknown', page_type: pageType };
}

function normalizePage(pageType) {
  if (pageType === 'product') return 'product';
  if (pageType === 'category') return 'category';
  if (pageType === 'cart' || pageType === 'checkout') return 'checkout';
  return 'main';
}

function statusFromScore(score) {
  if (score < 50) return 'critical';
  if (score < TARGET_LIGHTHOUSE_SCORE) return 'needs-improvement';
  return 'optimal';
}

function priority(value) {
  const normalized = String(value ?? 'medium').toLowerCase();
  if (['critical', 'high', 'medium', 'low'].includes(normalized)) return normalized;
  return 'medium';
}

function effortFromRisk(riskScore) {
  const risk = toNumber(riskScore);
  if (risk >= 7) return 'high';
  if (risk >= 4) return 'medium';
  return 'low';
}

function metricKeyFromText(...values) {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  if (text.includes('lcp')) return 'lcp';
  if (text.includes('cls')) return 'cls';
  if (text.includes('inp')) return 'inp';
  if (text.includes('fcp')) return 'fcp';
  if (text.includes('speed index') || text.includes('si')) return 'speedIndex';
  if (text.includes('asset') || text.includes('image') || text.includes('byte')) return 'assetSize';
  return 'tbt';
}

function metricItem(rawValue, target, formatter = (value) => round(value)) {
  const available = hasMeasuredValue(rawValue);
  return {
    value: available ? formatter(rawValue) : 0,
    available,
    ...target,
  };
}

function buildMetrics(row) {
  return {
    lcp: metricItem(row.lcp_ms, METRIC_TARGETS.lcp, msToSeconds),
    cls: metricItem(row.cls_score, METRIC_TARGETS.cls, (value) => round(value, 3)),
    inp: metricItem(row.inp_ms, METRIC_TARGETS.inp),
    tbt: metricItem(row.tbt_ms, METRIC_TARGETS.tbt),
    fcp: metricItem(row.fcp_ms, METRIC_TARGETS.fcp, msToSeconds),
    speedIndex: metricItem(row.si_ms, METRIC_TARGETS.speedIndex, msToSeconds),
    assetSize: metricItem(row.page_size_kb, METRIC_TARGETS.assetSize),
  };
}

function buildResource(row) {
  return {
    totalWeightKb: round(row.page_size_kb),
    jsKb: round(row.js_size_kb),
    cssKb: round(row.css_size_kb),
    imageKb: round(row.image_size_kb),
    requestCount: row.total_requests ?? undefined,
  };
}

function getLatencyStatus(ms) {
  if (ms < 300) return 'good';
  if (ms < 400) return 'warning';
  return 'poor';
}

function normalizeDevice(value) {
  const device = String(value ?? '').toLowerCase();
  if (device.includes('desktop') || device === 'pc') return 'Desktop';
  if (device.includes('tablet')) return 'Tablet';
  return 'Mobile';
}

function normalizeRegion(value) {
  return String(value || '지역 미상');
}

function normalizeIsp(value) {
  return String(value || '통신사 미상');
}

function hasMeasuredValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function shouldUseBenchmarkRow(current, candidate) {
  if (!current) return true;

  const currentIsMain = current.page_type === 'main';
  const candidateIsMain = candidate.page_type === 'main';
  if (currentIsMain !== candidateIsMain) return candidateIsMain;

  const currentHasSeo = hasMeasuredValue(current.seo_score);
  const candidateHasSeo = hasMeasuredValue(candidate.seo_score);
  if (currentHasSeo !== candidateHasSeo) return candidateHasSeo;

  return new Date(candidate.timestamp).getTime() > new Date(current.timestamp).getTime();
}

function normalizeClickHouseUtc(value) {
  if (!value) return null;
  const raw = String(value);
  if (raw.includes('T')) return raw.endsWith('Z') ? raw : raw + 'Z';
  return raw.replace(' ', 'T') + 'Z';
}

function formatKoreanDateTime(value) {
  const iso = normalizeClickHouseUtc(value);
  if (!iso) return null;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

function secondsSinceIso(iso) {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
}

function buildRumIngestionStatus(projectRows) {
  const projectStatuses = projectRows.map((row) => {
    const latestEventAt = normalizeClickHouseUtc(row.latest_event);
    return {
      projectId: row.pid,
      latestEventAt: latestEventAt || undefined,
      secondsSinceLatest: secondsSinceIso(latestEventAt),
      recentEvents5m: toNumber(row.recent_events_5m),
      recentEvents15m: toNumber(row.recent_events_15m),
      totalEvents: toNumber(row.total_events),
    };
  });

  const latestEventAt = projectStatuses
    .map((project) => project.latestEventAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const secondsSinceLatest = secondsSinceIso(latestEventAt);
  const recentEvents5m = projectStatuses.reduce((sum, row) => sum + row.recentEvents5m, 0);
  const recentEvents15m = projectStatuses.reduce((sum, row) => sum + row.recentEvents15m, 0);
  let status = 'empty';

  if (latestEventAt) {
    if (recentEvents5m > 0 || (secondsSinceLatest !== null && secondsSinceLatest <= RUM_LIVE_WINDOW_SECONDS)) {
      status = 'live';
    } else if (recentEvents15m > 0 || (secondsSinceLatest !== null && secondsSinceLatest <= RUM_DELAYED_WINDOW_SECONDS)) {
      status = 'delayed';
    } else {
      status = 'stale';
    }
  }

  return {
    status,
    latestEventAt: latestEventAt || undefined,
    secondsSinceLatest,
    recentEvents5m,
    recentEvents15m,
    projectStatuses,
  };
}


function getEventCount(eventRows, eventName) {
  const aliases = CUSTOM_EVENT_ALIASES[eventName] ?? [eventName];
  return eventRows
    .filter((row) => aliases.includes(row.event_name))
    .reduce((sum, row) => sum + toNumber(row.events), 0);
}

function getEventSessions(eventRows, eventName) {
  const aliases = CUSTOM_EVENT_ALIASES[eventName] ?? [eventName];
  return eventRows
    .filter((row) => aliases.includes(row.event_name))
    .reduce((sum, row) => sum + toNumber(row.sessions || row.events), 0);
}

function pathPageType(path) {
  if (path === '/cart' || path === '/checkout' || path.startsWith('/checkout')) return 'checkout';
  if (path.startsWith('/product/')) return 'product';
  return 'main';
}

function pathStepLabel(path) {
  if (path === '/') return '메인 페이지';
  if (path.startsWith('/category/')) return '카테고리 탐색';
  if (path.startsWith('/product/')) return '상품 상세 조회';
  if (path === '/cart') return '장바구니 페이지';
  if (path === '/login') return '로그인 페이지';
  if (path === '/s/our-stores') return '매장 찾기';
  return '페이지 조회';
}

function addJourneyStep(steps, step, previousSessions) {
  if (steps.length > 0 && step.sessions <= 0 && step.step !== '구매 완료') return previousSessions;

  const sessions = steps.length === 0 ? step.sessions : Math.min(previousSessions, step.sessions);
  const dropoffRate = previousSessions > 0 && steps.length > 0 ? round(((previousSessions - sessions) / previousSessions) * 100, 1) : 0;

  steps.push({
    ...step,
    sessions,
    dropoffRate,
    avgTime: step.avgTime ?? 0,
  });

  return sessions;
}

function isEventAlias(eventName, aliasKey) {
  const aliases = CUSTOM_EVENT_ALIASES[aliasKey] ?? [aliasKey];
  return aliases.includes(eventName);
}

function stepFromJourneyEvent(row) {
  const eventName = String(row.event_name || '');

  if (row.type === 'pageview') {
    const path = String(row.path || '/');
    return {
      step: pathStepLabel(path),
      event: path,
      pageType: pathPageType(path),
      stage: path.startsWith('/category/')
        ? 'category'
        : path.startsWith('/product/')
          ? 'product'
          : path === '/cart'
            ? 'cart'
            : null,
    };
  }

  if (isEventAlias(eventName, 'add_to_cart')) {
    return {
      step: '장바구니 담기',
      event: eventName,
      pageType: 'product',
      stage: 'addToCart',
    };
  }

  if (isEventAlias(eventName, 'checkout_click')) {
    return {
      step: '결제 진입',
      event: eventName,
      pageType: 'checkout',
      stage: 'checkout',
    };
  }

  if (isEventAlias(eventName, 'purchase')) {
    return {
      step: '구매 완료',
      event: eventName,
      pageType: 'checkout',
      stage: 'purchase',
      terminal: true,
    };
  }

  return null;
}

function addUniqueJourneyStep(journey, step) {
  const previous = journey.path.at(-1);
  if (previous && previous.step === step.step && previous.event === step.event) return;

  journey.path.push({
    step: step.step,
    event: step.event,
    pageType: step.pageType,
  });

  if (step.stage) journey.stages.add(step.stage);
  if (step.terminal) {
    journey.outcome = 'purchase';
    journey.completed = true;
  }
}

function buildVirtualJourneys(journeyEventRows) {
  const activeByPsid = new Map();
  const journeys = [];
  const rows = [...journeyEventRows].sort((a, b) => {
    const psidCompare = String(a.psid).localeCompare(String(b.psid));
    if (psidCompare !== 0) return psidCompare;
    return new Date(normalizeClickHouseUtc(a.created) || a.created).getTime()
      - new Date(normalizeClickHouseUtc(b.created) || b.created).getTime();
  });

  rows.forEach((row) => {
    if (!row.psid) return;

    const step = stepFromJourneyEvent(row);
    if (!step) return;

    const createdIso = normalizeClickHouseUtc(row.created);
    const createdAt = createdIso ? new Date(createdIso).getTime() : new Date(row.created).getTime();
    if (!Number.isFinite(createdAt)) return;

    const current = activeByPsid.get(row.psid);
    const shouldStartNew =
      !current ||
      current.completed ||
      (step.event === '/' && current.path.length > 0 && current.path.at(-1)?.event !== '/') ||
      createdAt - current.lastAt > JOURNEY_SESSION_GAP_MS;

    const journey = shouldStartNew
      ? {
        psid: row.psid,
        firstAt: createdAt,
        lastAt: createdAt,
        path: [],
        stages: new Set(),
        outcome: 'dropoff',
        completed: false,
      }
      : current;

    if (shouldStartNew) {
      journeys.push(journey);
      activeByPsid.set(row.psid, journey);
    }

    journey.lastAt = createdAt;
    addUniqueJourneyStep(journey, step);
  });

  return journeys.filter((journey) => journey.path.length > 0);
}

function buildJourneyFromEvents(journeyEventRows, fallbackTotalSessions) {
  const journeys = buildVirtualJourneys(journeyEventRows);
  const totalJourneys = journeys.length || fallbackTotalSessions;

  if (totalJourneys === 0) return null;

  const countStage = (stage) => journeys.filter((journey) => journey.stages.has(stage)).length;
  const userJourney = [];
  let previous = totalJourneys;

  previous = addJourneyStep(userJourney, { step: '방문 시작', sessions: totalJourneys, pageType: 'main' }, previous);
  previous = addJourneyStep(userJourney, { step: '카테고리 탐색', sessions: countStage('category'), pageType: 'main' }, previous);
  previous = addJourneyStep(userJourney, { step: '상품 상세 조회', sessions: countStage('product'), pageType: 'product' }, previous);
  previous = addJourneyStep(userJourney, { step: '장바구니 담기', sessions: countStage('addToCart'), pageType: 'product' }, previous);
  previous = addJourneyStep(userJourney, { step: '장바구니 페이지', sessions: countStage('cart'), pageType: 'checkout' }, previous);
  addJourneyStep(userJourney, { step: '구매 완료', sessions: countStage('purchase'), pageType: 'checkout' }, previous);

  const mergedRows = new Map();

  const displayJourneys = journeys.filter((journey) => journey.path[0]?.event === '/');
  const pathDenominator = displayJourneys.length || totalJourneys;

  displayJourneys.forEach((journey) => {
    const key = `${journey.outcome}:${journey.path.map((step) => `${step.step}:${step.pageType}`).join(' > ')}`;
    const current = mergedRows.get(key);

    if (current) {
      current.sessions += 1;
      return;
    }

    mergedRows.set(key, {
      sessions: 1,
      outcome: journey.outcome,
      path: journey.path,
    });
  });

  const sessionPaths = Array.from(mergedRows.values())
    .sort((a, b) => b.sessions - a.sessions || Number(b.outcome === 'purchase') - Number(a.outcome === 'purchase'))
    .map((row, index) => {
      const firstStep = row.path[0];
      const lastStep = row.path.at(-1);
      const isMainOnly = row.path.length === 1 && firstStep?.event === '/';
      const isDirectEntry = firstStep?.event !== '/';

      return {
        id: 'rum-journey-path-' + index + '-' + row.path.map((step) => step.event).join('-').replace(/[^a-z0-9]+/gi, '-'),
        name: row.outcome === 'purchase'
          ? '구매 완료 경로'
          : isMainOnly
            ? '메인 페이지만 본 경로'
            : isDirectEntry
              ? '직접 진입 경로'
              : '대표 방문 경로',
        source: 'Swetrix 여정 이벤트',
        device: 'Desktop',
        sessions: row.sessions,
        share: pathDenominator > 0 ? round((row.sessions / pathDenominator) * 100, 1) : 0,
        outcome: row.outcome,
        lastStep: row.outcome === 'purchase' ? '구매 완료' : lastStep?.step ?? '종료',
        path: row.path,
      };
    });

  return { userJourney, sessionPaths };
}

function buildPathBasedJourney(summary, pageRows) {
  const totalSessions = toNumber(summary.sessions) || toNumber(summary.page_views);
  if (totalSessions === 0) return { userJourney: [], sessionPaths: [] };

  const productSessions = toNumber(summary.product_sessions) || pageRows
    .filter((row) => String(row.path || '').startsWith('/product/'))
    .reduce((max, row) => Math.max(max, toNumber(row.sessions)), 0);
  const categorySessions = toNumber(summary.category_sessions) || pageRows
    .filter((row) => String(row.path || '').startsWith('/category/'))
    .reduce((max, row) => Math.max(max, toNumber(row.sessions)), 0);
  const cartSessions = toNumber(summary.cart_sessions) || pageRows
    .filter((row) => row.path === '/cart')
    .reduce((max, row) => Math.max(max, toNumber(row.sessions)), 0);
  const purchaseSessions = toNumber(summary.purchase_sessions);

  const steps = [
    { step: '방문 시작', sessions: totalSessions, pageType: 'main' },
    { step: '카테고리 탐색', sessions: Math.min(totalSessions, categorySessions), pageType: 'main' },
    { step: '상품 상세 조회', sessions: Math.min(totalSessions, productSessions), pageType: 'product' },
    { step: '장바구니 페이지', sessions: Math.min(productSessions || totalSessions, cartSessions), pageType: 'checkout' },
    { step: '구매 완료', sessions: Math.min(cartSessions || totalSessions, purchaseSessions), pageType: 'checkout' },
  ].filter((step, index) => index === 0 || step.sessions > 0 || step.step === '구매 완료');

  let previous = steps[0]?.sessions ?? 0;
  const userJourney = steps.map((step, index) => {
    const sessions = index === 0 ? step.sessions : Math.min(previous, step.sessions);
    const dropoffRate = previous > 0 && index > 0 ? round(((previous - sessions) / previous) * 100, 1) : 0;
    previous = sessions;
    return {
      ...step,
      sessions,
      dropoffRate,
      avgTime: index === 0 ? round(toNumber(summary.avg_page_load) / 1000, 1) : 0,
    };
  });

  const sessionPaths = pageRows.slice(0, 4).map((row, index) => {
    const path = String(row.path || '/');
    const isProduct = path.startsWith('/product/');
    const isCart = path === '/cart';
    return {
      id: 'rum-path-' + index + '-' + path.replace(/[^a-z0-9]+/gi, '-'),
      name: isProduct ? '상품 상세 방문 경로' : isCart ? '장바구니 방문 경로' : path === '/' ? '메인 방문 경로' : '페이지 방문 경로',
      source: 'Swetrix pageview',
      device: 'Desktop',
      sessions: toNumber(row.sessions),
      share: totalSessions > 0 ? round((toNumber(row.sessions) / totalSessions) * 100, 1) : 0,
      outcome: 'dropoff',
      lastStep: isProduct ? '상품 상세 조회' : isCart ? '장바구니 페이지' : '페이지 조회',
      path: [
        { step: '메인 페이지', event: '/', pageType: 'main' },
        { step: isProduct ? '상품 상세 조회' : isCart ? '장바구니 페이지' : path === '/' ? '메인 페이지' : '페이지 조회', event: path, pageType: isProduct ? 'product' : isCart ? 'checkout' : 'main' },
      ],
    };
  });

  return { userJourney, sessionPaths };
}

function buildCustomJourney(summary, eventRows, pageRows = [], journeyEventRows = []) {
  const pageViews = toNumber(summary.page_views);
  const totalSessions = toNumber(summary.sessions) || pageViews;
  const hasCustomEvents = eventRows.some((row) => row.event_name && row.event_name !== "page_view");
  const eventBasedJourney = journeyEventRows.length > 0
    ? buildJourneyFromEvents(journeyEventRows, totalSessions)
    : null;

  if (!hasCustomEvents) {
    const pathBased = buildPathBasedJourney(summary, pageRows);
    const sessionPaths = eventBasedJourney?.sessionPaths ?? pathBased.sessionPaths;

    return { ...pathBased, sessionPaths };
  }

  const categorySessions = toNumber(summary.category_sessions);
  const productSessions = Math.max(toNumber(summary.product_sessions), getEventSessions(eventRows, "product_view"));
  const addToCartSessions = getEventSessions(eventRows, "add_to_cart");
  const cartSessions = Math.max(toNumber(summary.cart_sessions), getEventSessions(eventRows, "cart_view"), addToCartSessions);
  const checkoutSessions = getEventSessions(eventRows, "checkout_click");
  const purchaseSessions = Math.max(toNumber(summary.purchase_sessions), getEventSessions(eventRows, "purchase"));

  const userJourney = [];
  let previous = Math.max(totalSessions, getEventSessions(eventRows, "page_view"));

  previous = addJourneyStep(userJourney, { step: '방문 시작', sessions: previous, pageType: 'main' }, previous);
  previous = addJourneyStep(userJourney, { step: '카테고리 탐색', sessions: categorySessions, pageType: 'main' }, previous);
  previous = addJourneyStep(userJourney, { step: '상품 상세 조회', sessions: productSessions, pageType: 'product' }, previous);
  previous = addJourneyStep(userJourney, { step: '장바구니 담기', sessions: addToCartSessions, pageType: 'product' }, previous);
  previous = addJourneyStep(userJourney, { step: '장바구니 페이지', sessions: cartSessions, pageType: 'checkout' }, previous);
  previous = addJourneyStep(userJourney, { step: '결제 진입', sessions: checkoutSessions, pageType: 'checkout' }, previous);
  addJourneyStep(userJourney, { step: '구매 완료', sessions: purchaseSessions, pageType: 'checkout' }, previous);

  const sessionPaths = eventBasedJourney?.sessionPaths ?? buildPathBasedJourney(summary, pageRows).sessionPaths;

  return { userJourney, sessionPaths };
}

function toBenchmark(row, isTarget) {
  return {
    brand: normalizeBrand(row),
    isTarget,
    scores: {
      lighthouse: round(row.performance_score),
      seo: round(row.seo_score, 0),
      target_lighthouse: TARGET_LIGHTHOUSE_SCORE,
    },
    metrics: buildMetrics(row),
    resource: buildResource(row),
    technicalSeo: {
      title: row.seo_score ? row.seo_score >= 70 : undefined,
      metaDescription: row.seo_score ? row.seo_score >= 70 : undefined,
      mobileViewport: true,
    },
    fieldData: {
      availability: 'unavailable',
      source: 'none',
    },
  };
}

function buildTrends(rows) {
  const labels = [...new Set(rows.map((row) => row.label))].sort();
  const brands = [...new Set(rows.map((row) => normalizeBrand(row)))];

  return {
    labels,
    datasets: brands.map((brand) => ({
      brand,
      metricKey: 'lighthouse',
      values: labels.map((label) => {
        const dayRows = rows.filter((candidate) => candidate.label === label && normalizeBrand(candidate) === brand);
        if (!dayRows.length) return null;
        return round(sumValues(dayRows, (row) => row.performance_score) / dayRows.length, 0);
      }),
    })),
    releases: [],
  };
}

function parsePatchCode(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function summarizePatchReason(value) {
  if (!value) return null;
  const text = String(value).trim();
  const jsonStart = text.search(/\n\s*\{/);
  const firstPart = jsonStart >= 0 ? text.slice(0, jsonStart).trim() : text;
  return firstPart.length > 260 ? firstPart.slice(0, 257).trimEnd() + '...' : firstPart;
}

function buildAiPlan(row) {
  const metricKey = metricKeyFromText(row.action, row.problem_summary, row.reasoning);
  const estimatedMs = toNumber(row.estimated_improvement);
  const auditClassification = row.audit_url ? classifyUrl(row.audit_url) : {};
  const brand = normalizeBrand({ ...auditClassification, ...row });
  const patchStatus = String(row.patch_status ?? '').toLowerCase();
  const buildStatus = row.build_status ? String(row.build_status).toLowerCase() : '';
  const history = Array.isArray(row.attempt_history) ? row.attempt_history : [];
  const changes = Array.isArray(row.changes) ? row.changes : [];
  const firstChange = changes[0] || null;
  const patchPayload = parsePatchCode(row.patch_code);
  const lastHistoryEvent = history.length > 0 ? history[history.length - 1] : null;
  const visibleHistoryEvent = lastHistoryEvent ? {
    event: lastHistoryEvent.event,
    patch_status: lastHistoryEvent.patch_status,
    error_message: lastHistoryEvent.error_message,
    worker_id: lastHistoryEvent.worker_id,
    time: lastHistoryEvent.time || lastHistoryEvent.requested_at,
  } : null;
  const manualReviewReason = patchPayload?.manual_review_reason || lastHistoryEvent?.manual_review_reason;
  const manualReviewSummary = summarizePatchReason(manualReviewReason);
  const failureReason = row.rejection_reason || lastHistoryEvent?.error_message || manualReviewSummary;
  let remediationStatus = row.auto_applicable === false ? 'pending-connection' : 'approval-ready';
  let remediationMessage = row.auto_applicable === false
    ? '자동 적용 가능한 수정안이 아니라 수동 검토가 필요합니다.'
    : undefined;

  if (patchStatus === 'approved_to_apply') {
    remediationStatus = 'approval-pending';
    remediationMessage = '대시보드 승인 후 적용 Worker 처리를 기다리는 중입니다.';
  } else if (patchStatus === 'applying' || patchStatus === 'local_test_running' || patchStatus === 'build_testing') {
    remediationStatus = 'running';
    remediationMessage = patchStatus === 'build_testing' ? 'AI 수정안 빌드 검증이 진행 중입니다.' : 'AI 적용 작업이 진행 중입니다.';
  } else if (patchStatus === 'patch_applied') {
    remediationStatus = 'running';
    remediationMessage = 'AI 수정안이 워크스페이스에 적용되어 후속 검증을 기다립니다.';
  } else if (patchStatus === 'pushed' || patchStatus === 'completed' || patchStatus === 'applied') {
    remediationStatus = 'completed';
    remediationMessage = patchStatus === 'pushed' ? 'AI 수정 브랜치가 push된 상태입니다.' : 'AI 개선안이 적용 완료된 상태입니다.';
  } else if (patchStatus === 'rejected') {
    remediationStatus = 'rejected';
    remediationMessage = failureReason ? 'AI 개선안이 거절되었습니다: ' + failureReason : 'AI 개선안이 거절되었습니다.';
  } else if (patchStatus === 'apply_failed' || patchStatus === 'local_test_failed' || patchStatus === 'build_failed' || patchStatus === 'push_failed' || patchStatus === 'failed') {
    remediationStatus = 'failed';
    remediationMessage = failureReason ? 'AI 개선안 적용이 실패했습니다: ' + failureReason : 'AI 개선안 적용이 실패했습니다.';
  } else if (!patchStatus) {
    remediationStatus = 'pending-connection';
  }

  const changeCount = Number(row.change_count || changes.length || 0);
  const failedMetrics = Array.isArray(row.failed_metrics)
    ? row.failed_metrics.join(', ')
    : row.failed_metrics ? JSON.stringify(row.failed_metrics) : null;

  return {
    id: String(row.id),
    brand,
    metricKey,
    title: row.action || row.problem_summary || 'Performance optimization',
    description: row.problem_summary || row.reasoning || 'Optimization candidate generated from audit data.',
    priority: priority(row.priority_level),
    estimatedImpact: estimatedMs ? `${round(estimatedMs, 0)} ms improvement` : 'Impact pending verification',
    effort: effortFromRisk(row.total_risk_score),
    impactScore: Math.min(10, Math.max(1, round((estimatedMs || 100) / 80, 1))),
    autoApplicable: row.auto_applicable === true,
    changeCount,
    remediationStatus,
    remediationMessage,
    patchStatus: row.patch_status ?? undefined,
    buildStatus: row.build_status ?? undefined,
    rejectionReason: row.rejection_reason ?? manualReviewSummary ?? undefined,
    lastHistoryEvent: visibleHistoryEvent ?? undefined,
    decision: {
      problem: row.problem_summary ?? undefined,
      area: [row.page_type, row.device_type].filter(Boolean).join(' / ') || undefined,
      reason: row.reasoning ?? undefined,
      evidence: failedMetrics ? '반복 실패 지표: ' + failedMetrics : undefined,
      fix: row.action ?? undefined,
      codeTitle: firstChange ? changeCount + '개 코드 변경안 중 대표 변경' : undefined,
      beforeCode: firstChange?.original_code ?? undefined,
      afterCode: firstChange?.suggested_code ?? undefined,
      conclusion: row.impact_if_fixed ?? undefined,
      source: 'core_db.fix_plans + fix_plan_changes',
      generatedAt: row.created_at?.toISOString?.() ?? undefined,
    },
  };
}

function normalizeScore(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric <= 1 ? numeric * 100 : numeric;
}

function averageField(rows, field) {
  const values = rows
    .map((row) => row[field])
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);

  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildAverageLighthouseRow(rows) {
  if (!rows.length) return null;

  const latest = [...rows].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] ?? rows[0];

  return {
    ...latest,
    url: 'target-pages-average',
    page_type: 'summary',
    performance_score: averageField(rows, 'performance_score'),
    accessibility_score: averageField(rows, 'accessibility_score'),
    best_practices_score: averageField(rows, 'best_practices_score'),
    seo_score: averageField(rows, 'seo_score'),
    lcp_ms: averageField(rows, 'lcp_ms'),
    tbt_ms: averageField(rows, 'tbt_ms'),
    cls_score: averageField(rows, 'cls_score'),
    fcp_ms: averageField(rows, 'fcp_ms'),
    si_ms: averageField(rows, 'si_ms'),
    tti_ms: averageField(rows, 'tti_ms'),
    ttfb_ms: averageField(rows, 'ttfb_ms'),
    inp_ms: averageField(rows, 'inp_ms'),
    total_requests: averageField(rows, 'total_requests'),
    page_size_kb: averageField(rows, 'page_size_kb'),
  };
}

function mapLhciRun(row) {
  const classification = classifyUrl(row.url);

  return {
    ...classification,
    url: row.url,
    device_type: 'desktop',
    timestamp: row.timestamp,
    lcp_ms: toNumber(row.lcp_ms, null),
    tbt_ms: toNumber(row.tbt_ms, null),
    cls_score: toNumber(row.cls_score, null),
    fcp_ms: toNumber(row.fcp_ms, null),
    si_ms: toNumber(row.si_ms, null),
    tti_ms: toNumber(row.tti_ms, null),
    ttfb_ms: toNumber(row.ttfb_ms, null),
    inp_ms: toNumber(row.inp_ms, null),
    performance_score: normalizeScore(row.performance_score),
    accessibility_score: normalizeScore(row.accessibility_score),
    best_practices_score: normalizeScore(row.best_practices_score),
    seo_score: normalizeScore(row.seo_score),
    total_requests: row.total_requests,
    page_size_kb: row.page_size_kb,
    js_size_kb: null,
    css_size_kb: null,
    image_size_kb: null,
  };
}

async function fetchLatestLighthouseRows(pool) {
  const { rows } = await pool.query(`
    WITH ranked AS (
      SELECT
        r.url,
        r."createdAt" AS timestamp,
        r.representative,
        r.lhr::jsonb #>> '{categories,performance,score}' AS performance_score,
        r.lhr::jsonb #>> '{categories,accessibility,score}' AS accessibility_score,
        r.lhr::jsonb #>> '{categories,best-practices,score}' AS best_practices_score,
        r.lhr::jsonb #>> '{categories,seo,score}' AS seo_score,
        r.lhr::jsonb #>> '{audits,largest-contentful-paint,numericValue}' AS lcp_ms,
        r.lhr::jsonb #>> '{audits,total-blocking-time,numericValue}' AS tbt_ms,
        r.lhr::jsonb #>> '{audits,cumulative-layout-shift,numericValue}' AS cls_score,
        r.lhr::jsonb #>> '{audits,first-contentful-paint,numericValue}' AS fcp_ms,
        r.lhr::jsonb #>> '{audits,speed-index,numericValue}' AS si_ms,
        r.lhr::jsonb #>> '{audits,interactive,numericValue}' AS tti_ms,
        r.lhr::jsonb #>> '{audits,server-response-time,numericValue}' AS ttfb_ms,
        COALESCE(
          r.lhr::jsonb #>> '{audits,interaction-to-next-paint,numericValue}',
          r.lhr::jsonb #>> '{audits,experimental-interaction-to-next-paint,numericValue}'
        ) AS inp_ms,
        (r.lhr::jsonb #>> '{audits,total-byte-weight,numericValue}')::float / 1024 AS page_size_kb,
        jsonb_array_length(COALESCE(r.lhr::jsonb #> '{audits,network-requests,details,items}', '[]'::jsonb)) AS total_requests,
        ROW_NUMBER() OVER (
          PARTITION BY r.url
          ORDER BY
            (r.lhr::jsonb #>> '{categories,seo,score}') IS NOT NULL DESC,
            r.representative DESC,
            r."createdAt" DESC
        ) AS row_rank
      FROM runs r
    )
    SELECT *
    FROM ranked
    WHERE row_rank = 1
    ORDER BY timestamp DESC, url DESC
  `);

  return rows.map(mapLhciRun);
}

async function fetchTrendRows(pool) {
  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(r."createdAt"::date, 'YYYY-MM-DD') AS label,
      r.url,
      AVG((r.lhr::jsonb #>> '{categories,performance,score}')::float * 100) AS performance_score
    FROM runs r
    WHERE r.lhr::jsonb #>> '{categories,performance,score}' IS NOT NULL
    GROUP BY r."createdAt"::date, r.url
    ORDER BY r."createdAt"::date ASC
  `);

  return rows.map((row) => ({ ...row, ...classifyUrl(row.url) }));
}

async function fetchAiPlans(pool) {
  const { rows } = await pool.query(`
    WITH change_summary AS (
      SELECT
        fix_plan_id,
        COUNT(*)::int AS change_count,
        MAX(created_at) AS latest_change_at,
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'target_file', target_file,
            'original_code', original_code,
            'suggested_code', suggested_code,
            'change_type', change_type,
            'change_reason', change_reason,
            'apply_status', apply_status,
            'created_at', created_at,
            'applied_at', applied_at
          )
          ORDER BY id ASC
        ) AS changes
      FROM fix_plan_changes
      GROUP BY fix_plan_id
    ),
    audit_summary AS (
      SELECT
        lhci_build_id,
        page_type,
        form_factor,
        site_type,
        MAX(url) AS audit_url,
        AVG(performance_score) AS audit_performance_score,
        MAX(created_at) AS audit_created_at
      FROM lhci_audit_runs
      GROUP BY lhci_build_id, page_type, form_factor, site_type
    )
    SELECT
      fp.*,
      audit_summary.audit_url,
      audit_summary.audit_performance_score,
      audit_summary.audit_created_at,
      COALESCE(change_summary.change_count, 0) AS change_count,
      COALESCE(change_summary.changes, '[]'::jsonb) AS changes,
      change_summary.latest_change_at
    FROM fix_plans fp
    LEFT JOIN audit_summary ON audit_summary.lhci_build_id = fp.lhci_build_id
      AND COALESCE(audit_summary.page_type, '') = COALESCE(fp.page_type, '')
      AND COALESCE(audit_summary.form_factor, '') = COALESCE(fp.device_type, '')
      AND COALESCE(audit_summary.site_type, '') = COALESCE(fp.site_type, '')
    LEFT JOIN change_summary ON change_summary.fix_plan_id = fp.id
    ORDER BY fp.created_at DESC NULLS LAST, fp.id DESC
  `);

  return rows;
}

async function fetchRumData(options = {}) {
  const projectIds = getRumProjectIds();
  if (projectIds.length === 0) return null;

  const { clause: timeClause, label: periodLabel } = buildRumTimeFilter(options);
  const projectList = projectIds.map(sqlString).join(', ');
  const customEventList = [...new Set(CUSTOM_EVENT_FLOW.flatMap((item) => CUSTOM_EVENT_ALIASES[item.event] ?? [item.event]))].map(sqlString).join(", ");
  const purchaseEventList = CUSTOM_EVENT_ALIASES.purchase.map(sqlString).join(", ");

  try {
    const [summaryRows, deviceRows, regionalRows, pageRows, journeyEventRows, eventRows, projectRows] = await Promise.all([
      queryClickHouse(`
        SELECT
          uniqExactIf(psid, type = 'pageview' AND psid IS NOT NULL) AS sessions,
          countIf(type = 'pageview') AS page_views,
          count() AS total_events,
          uniqExactIf(psid, type = 'pageview' AND psid IS NOT NULL AND startsWith(ifNull(pg, ''), '/category/')) AS category_sessions,
          uniqExactIf(psid, type = 'pageview' AND psid IS NOT NULL AND startsWith(ifNull(pg, ''), '/product/')) AS product_sessions,
          uniqExactIf(psid, type = 'pageview' AND psid IS NOT NULL AND ifNull(pg, '') = '/cart') AS cart_sessions,
          uniqExactIf(psid, event_name IN (${purchaseEventList}) AND psid IS NOT NULL) AS purchase_sessions,
          countIf(event_name IN (${purchaseEventList})) AS purchase_events,
          countIf(type = 'performance') AS performance_events,
          avgIf(pageLoad, type = 'performance' AND pageLoad > 0) AS avg_page_load,
          max(created) AS latest_event
        FROM ${CLICKHOUSE_EVENTS_TABLE}
        WHERE pid IN (${projectList})
          ${timeClause}
      `),
      queryClickHouse(`
        SELECT
          dv AS device,
          uniqExactIf(psid, type = 'pageview' AND psid IS NOT NULL) AS sessions,
          countIf(type = 'pageview') AS page_views,
          uniqExactIf(psid, event_name IN (${purchaseEventList}) AND psid IS NOT NULL) AS purchase_sessions,
          avgIf(pageLoad, type = 'performance' AND pageLoad > 0) AS avg_page_load
        FROM ${CLICKHOUSE_EVENTS_TABLE}
        WHERE pid IN (${projectList})
          ${timeClause}
        GROUP BY dv
        HAVING sessions > 0
        ORDER BY sessions DESC
      `),
      queryClickHouse(`
        SELECT
          rg AS region,
          isp,
          uniqExactIf(psid, type = 'pageview' AND psid IS NOT NULL) AS sessions,
          countIf(type = 'pageview') AS page_views,
          avgIf(pageLoad, type = 'performance' AND pageLoad > 0) AS avg_page_load
        FROM ${CLICKHOUSE_EVENTS_TABLE}
        WHERE pid IN (${projectList})
          ${timeClause}
        GROUP BY rg, isp
        HAVING sessions > 0
        ORDER BY sessions DESC
        LIMIT 80
      `),
      queryClickHouse(`
        SELECT
          pg AS path,
          uniqExactIf(psid, type = 'pageview' AND psid IS NOT NULL) AS sessions,
          countIf(type = 'pageview') AS page_views,
          countIf(type = 'performance' AND pageLoad > 0) AS measured_page_load_events,
          avgIf(pageLoad, type = 'performance' AND pageLoad > 0) AS avg_page_load,
          quantileIf(0.75)(pageLoad, type = 'performance' AND pageLoad > 0) AS p75_page_load
        FROM ${CLICKHOUSE_EVENTS_TABLE}
        WHERE pid IN (${projectList})
          ${timeClause}
        GROUP BY pg
        HAVING sessions > 0
        ORDER BY sessions DESC
        LIMIT 12
      `),
      queryClickHouse(`
        SELECT
          toString(psid) AS psid,
          created,
          type,
          ifNull(pg, '/') AS path,
          ifNull(event_name, '') AS event_name
        FROM ${CLICKHOUSE_EVENTS_TABLE}
        WHERE pid IN (${projectList})
          ${timeClause}
          AND psid IS NOT NULL
          AND (
            type = 'pageview'
            OR event_name IN (${customEventList})
          )
        ORDER BY psid, created
        LIMIT 5000
      `),
      queryClickHouse(`
        SELECT
          event_name,
          count() AS events,
          uniqExactIf(psid, psid IS NOT NULL) AS sessions,
          max(created) AS latest_event
        FROM ${CLICKHOUSE_EVENTS_TABLE}
        WHERE pid IN (${projectList})
          ${timeClause}
          AND event_name IN (${customEventList})
        GROUP BY event_name
        HAVING events > 0
        ORDER BY events DESC
      `),
      queryClickHouse(`
        SELECT
          pid,
          count() AS total_events,
          countIf(created >= now() - INTERVAL 5 MINUTE) AS recent_events_5m,
          countIf(created >= now() - INTERVAL 15 MINUTE) AS recent_events_15m,
          max(created) AS latest_event
        FROM ${CLICKHOUSE_EVENTS_TABLE}
        WHERE pid IN (${projectList})
        GROUP BY pid
        ORDER BY latest_event DESC
      `),
    ]);

    const summary = summaryRows[0] ?? {};
    const sessions = toNumber(summary.sessions);
    const purchaseSessions = toNumber(summary.purchase_sessions);
    const latestEvent = summary.latest_event || null;
    const latestEventIso = normalizeClickHouseUtc(latestEvent);
    const latestEventLabel = formatKoreanDateTime(latestEvent);
    const customJourney = buildCustomJourney(summary, eventRows, pageRows, journeyEventRows);
    const ingestion = buildRumIngestionStatus(projectRows);

    return {
      businessMetrics: {
        trafficSessions: {
          sessions,
          source: `Swetrix RUM (${projectIds.length} projects)`,
          period: latestEventLabel ? `${periodLabel} · 최근 접속 기록 ${latestEventLabel}` : periodLabel,
          confidence: 'measured',
        },
        deviceSegments: deviceRows.map((row) => ({
          device: normalizeDevice(row.device),
          sessions: toNumber(row.sessions),
          purchases: toNumber(row.purchase_sessions),
          revenue: 0,
          conversionRate: toNumber(row.sessions) > 0 ? round((toNumber(row.purchase_sessions) / toNumber(row.sessions)) * 100, 1) : 0,
          bounceRate: 0,
          averageOrderValue: 0,
        })),
        conversionRate: {
          value: sessions > 0 ? round((purchaseSessions / sessions) * 100, 1) : 0,
          source: 'Swetrix purchase custom event',
          period: periodLabel,
          isProxy: false,
        },
        internalRevenueModel: buildInternalRevenueModel(summary),
      },
      rum: {
        regionalData: regionalRows.map((row) => {
          const latency = round(row.avg_page_load, 0);
          return {
            region: normalizeRegion(row.region),
            isp: normalizeIsp(row.isp),
            avgLatency: latency,
            status: getLatencyStatus(latency),
            sessions: toNumber(row.sessions),
          };
        }),
        userJourney: customJourney.userJourney,
        sessionPaths: customJourney.sessionPaths,
        pagePerformance: pageRows.map((row) => ({
          path: row.path || '/',
          sessions: toNumber(row.sessions),
          pageViews: toNumber(row.page_views),
          loadingSamples: toNumber(row.measured_page_load_events),
          avgPageLoad: hasMeasuredValue(row.avg_page_load) ? round(row.avg_page_load, 0) : undefined,
          p75PageLoad: hasMeasuredValue(row.p75_page_load) ? round(row.p75_page_load, 0) : undefined,
        })),
        latestCollectedAt: latestEventIso || undefined,
        ingestion,
      },
    };
  } catch (error) {
    console.warn(error instanceof Error ? error.message : error);
    return null;
  }
}

export async function getDashboardPerformanceData(pool, options = {}) {
  const [latestRows, trendRows, aiPlanRows] = await Promise.all([
    fetchLatestLighthouseRows(pool.lhci),
    fetchTrendRows(pool.lhci),
    fetchAiPlans(pool.core),
  ]);
  const rumData = await fetchRumData(options);

  const preferredTargetSiteType = latestRows.some((row) => row.site_type === 'target') ? 'target' : 'decathlon';
  const targetRows = latestRows.filter((row) => row.site_type === preferredTargetSiteType);
  const targetMain = targetRows.find((row) => row.page_type === 'main') ?? targetRows[0] ?? latestRows[0];
  const targetAggregate = buildAverageLighthouseRow(targetRows);
  const benchmarkSeed = new Map();

  if (targetAggregate) {
    benchmarkSeed.set('Decathlon', targetAggregate);
  }

  latestRows.forEach((row) => {
    if (row.site_type === 'competitor' && row.competitor_name === 'unknown') return;

    const brand = normalizeBrand(row);
    if (targetAggregate && brand === 'Decathlon') return;

    const existing = benchmarkSeed.get(brand);
    if (shouldUseBenchmarkRow(existing, row)) {
      benchmarkSeed.set(brand, row);
    }
  });

  const benchmarks = [...benchmarkSeed.values()].map((row) => (
    toBenchmark(row, row.site_type === 'target' || row.site_type === 'decathlon')
  ));

  const pageMetrics = targetRows
    .filter((row) => ['main', 'category', 'product', 'cart', 'checkout'].includes(row.page_type))
    .map((row) => ({
      ...toBenchmark(row, true),
      page: normalizePage(row.page_type),
    }));

  const summaryTarget = targetAggregate ?? targetMain;
  const globalScore = round(summaryTarget?.performance_score ?? 0, 0);
  const seoScore = round(summaryTarget?.seo_score ?? 0, 0);
  return {
    timestamp: new Date().toISOString(),
    executiveSummary: {
      globalScore,
      status: statusFromScore(globalScore),
      baselineAnnualRevenue: 30_000_000_000,
      seoHealth: {
        rankPercentile: seoScore || 0,
        estimatedChange: Math.max(0, TARGET_LIGHTHOUSE_SCORE - (seoScore || 0)),
      },
      carbonFootprint: {
        gramsPerPageView: round((summaryTarget?.page_size_kb ?? 0) * 0.0004, 2),
        savedGrams: round(Math.max(0, (summaryTarget?.page_size_kb ?? 0) - 450) * 0.0004, 2),
      },
    },
    businessMetrics: {
      performanceAudit: {
        latestMeasuredAt: summaryTarget?.timestamp?.toISOString?.() ?? summaryTarget?.timestamp ?? undefined,
        source: 'lhci.runs',
        period: 'latest Lighthouse audit',
        pages: [...new Set(targetRows.map((row) => normalizePage(row.page_type)))],
        confidence: 'measured',
      },
      trafficSessions: {
        sessions: 0,
        source: 'RUM/session API not connected yet',
        period: 'current',
        confidence: 'mock',
      },
      ...rumData?.businessMetrics,
      searchVisibility: {
        relativeRankPercentile: seoScore || 0,
        seoScore: seoScore || undefined,
        source: 'lhci.runs',
        period: 'latest audit',
      },
    },
    benchmarks,
    pageMetrics,
    trends: buildTrends(trendRows),
    rum: {
      regionalData: rumData?.rum.regionalData ?? [],
      userJourney: rumData?.rum.userJourney ?? [],
      sessionPaths: rumData?.rum.sessionPaths ?? [],
      pagePerformance: rumData?.rum.pagePerformance ?? [],
      latestCollectedAt: rumData?.rum.latestCollectedAt,
      ingestion: rumData?.rum.ingestion,
    },
    aiFixPlans: aiPlanRows.map(buildAiPlan),
  };
}
