const TARGET_LIGHTHOUSE_SCORE = 90;
const DEFAULT_RUM_PROJECT_IDS = ['n9FlE09mPFlv', '6MZNYXghl1v8'];
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL
  ?? process.env.SWETRIX_CLICKHOUSE_URL
  ?? `http://${process.env.CLICKHOUSE_HOST ?? '127.0.0.1'}:${process.env.CLICKHOUSE_PORT ?? 8123}`;
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE ?? 'analytics';
const CLICKHOUSE_EVENTS_TABLE = process.env.CLICKHOUSE_EVENTS_TABLE ?? 'analytics.events';
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER;
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD;

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
  purchase: ["purchase", "mock_purchase", "purchase_complete"],
  checkout_click: ["checkout_click", "checkout_start"],
};

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
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
  else if (value.includes('/products/') || value.includes('/p/')) pageType = 'product';
  else if (value.includes('/c/') || value.includes('category')) pageType = 'category';

  return pageType;
}

function classifyUrl(url) {
  const value = String(url ?? '').toLowerCase();
  const pageType = pageTypeFromUrl(value);

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

function buildPathBasedJourney(summary, pageRows) {
  const totalSessions = toNumber(summary.sessions) || toNumber(summary.page_views);
  if (totalSessions === 0) return { userJourney: [], sessionPaths: [] };

  const productSessions = pageRows
    .filter((row) => String(row.path || '').startsWith('/product/'))
    .reduce((max, row) => Math.max(max, toNumber(row.sessions)), 0);
  const cartSessions = pageRows
    .filter((row) => row.path === '/cart')
    .reduce((max, row) => Math.max(max, toNumber(row.sessions)), 0);

  const steps = [
    { step: '사이트 진입', sessions: totalSessions, pageType: 'main' },
    { step: '상품 상세 조회', sessions: Math.min(totalSessions, productSessions), pageType: 'product' },
    { step: '장바구니', sessions: Math.min(productSessions || totalSessions, cartSessions), pageType: 'checkout' },
    { step: '구매 완료', sessions: 0, pageType: 'checkout' },
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
      lastStep: isProduct ? '상품 상세 조회' : isCart ? '장바구니' : '페이지 조회',
      path: [
        { step: '사이트 진입', event: 'pageview', pageType: 'main' },
        { step: isProduct ? '상품 상세 조회' : isCart ? '장바구니' : path === '/' ? '메인 페이지' : '페이지 조회', event: path, pageType: isProduct ? 'product' : isCart ? 'checkout' : 'main' },
      ],
    };
  });

  return { userJourney, sessionPaths };
}

function buildCustomJourney(summary, eventRows, pageRows = []) {
  const pageViews = toNumber(summary.page_views);
  const totalSessions = toNumber(summary.sessions) || pageViews;
  const hasCustomEvents = eventRows.some((row) => row.event_name && row.event_name !== "page_view");

  if (!hasCustomEvents) {
    return buildPathBasedJourney(summary, pageRows);
  }

  let previous = Math.max(totalSessions, getEventSessions(eventRows, "page_view"));
  const userJourney = CUSTOM_EVENT_FLOW.map((item, index) => {
    const rawCount = index === 0 ? previous : getEventSessions(eventRows, item.event);
    const sessions = index === 0 ? previous : Math.min(previous, rawCount);
    const dropoffRate = previous > 0 && index > 0 ? round(((previous - sessions) / previous) * 100, 1) : 0;
    previous = sessions;

    return {
      step: item.label,
      sessions,
      dropoffRate,
      avgTime: 0,
      pageType: item.pageType,
    };
  }).filter((step, index) => index === 0 || step.sessions > 0);

  const journeyTotalSessions = userJourney[0]?.sessions ?? 0;
  const purchases = getEventSessions(eventRows, "purchase");
  const lastStep = userJourney.at(-1);
  const sessionPaths = journeyTotalSessions > 0 && userJourney.length > 1 ? [{
    id: "custom-event-main-flow",
    name: "주요 구매 여정",
    source: "Swetrix custom event",
    device: "Desktop",
    sessions: journeyTotalSessions,
    share: 100,
    outcome: purchases > 0 ? "purchase" : "dropoff",
    lastStep: lastStep?.step ?? "사이트 진입",
    path: userJourney.map((step) => ({
      step: step.step,
      event: step.step,
      pageType: step.pageType,
    })),
  }] : [];

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
        const row = rows.find((candidate) => candidate.label === label && normalizeBrand(candidate) === brand);
        return row ? round(row.performance_score, 0) : 0;
      }),
    })),
    releases: [],
  };
}

function buildAiPlan(row) {
  const metricKey = metricKeyFromText(row.action, row.problem_summary, row.reasoning);
  const estimatedMs = toNumber(row.estimated_improvement);
  const brand = row.test_id ? normalizeBrand(row) : 'Decathlon';

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
    remediationStatus: row.patch_status === 'completed' ? 'completed' : 'pending-connection',
    decision: {
      problem: row.problem_summary ?? undefined,
      reason: row.reasoning ?? undefined,
      fix: row.action ?? undefined,
      afterCode: row.patch_code ?? undefined,
      conclusion: row.impact_if_fixed ?? undefined,
      source: 'core_db.fix_plans',
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
    SELECT
      fp.*,
      lr.site_type,
      lr.competitor_name
    FROM fix_plans fp
    LEFT JOIN lighthouse_runs lr ON lr.test_id = fp.test_id
    ORDER BY fp.created_at DESC, fp.id DESC
    LIMIT 12
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
    const [summaryRows, deviceRows, regionalRows, pageRows, eventRows] = await Promise.all([
      queryClickHouse(`
        SELECT
          uniqExactIf(psid, type = 'pageview' AND psid IS NOT NULL) AS sessions,
          countIf(type = 'pageview') AS page_views,
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
    ]);

    const summary = summaryRows[0] ?? {};
    const sessions = toNumber(summary.sessions);
    const purchaseSessions = toNumber(summary.purchase_sessions);
    const latestEvent = summary.latest_event || null;
    const latestEventIso = normalizeClickHouseUtc(latestEvent);
    const latestEventLabel = formatKoreanDateTime(latestEvent);
    const customJourney = buildCustomJourney(summary, eventRows, pageRows);

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
          avgPageLoad: round(row.avg_page_load, 0),
          p75PageLoad: round(row.p75_page_load, 0),
        })),
        latestCollectedAt: latestEventIso || undefined,
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
  const benchmarkSeed = new Map();

  latestRows.forEach((row) => {
    if (row.site_type === 'competitor' && row.competitor_name === 'unknown') return;

    const brand = normalizeBrand(row);
    const existing = benchmarkSeed.get(brand);
    if (shouldUseBenchmarkRow(existing, row)) {
      benchmarkSeed.set(brand, row);
    }
  });

  const benchmarks = [...benchmarkSeed.values()].map((row) => (
    toBenchmark(row, row.site_type === 'target' || row.site_type === 'decathlon')
  ));

  const pageMetrics = targetRows
    .filter((row) => ['main', 'product', 'cart', 'checkout'].includes(row.page_type))
    .map((row) => ({
      ...toBenchmark(row, true),
      page: normalizePage(row.page_type),
    }));

  const globalScore = round(targetMain?.performance_score ?? 0, 0);
  const seoScore = round(targetMain?.seo_score ?? 0, 0);

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
        gramsPerPageView: round((targetMain?.page_size_kb ?? 0) * 0.0004, 2),
        savedGrams: round(Math.max(0, (targetMain?.page_size_kb ?? 0) - 450) * 0.0004, 2),
      },
    },
    businessMetrics: {
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
    },
    aiFixPlans: aiPlanRows.map(buildAiPlan),
  };
}
