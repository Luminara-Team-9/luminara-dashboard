import type { BusinessMetrics, PageType, PerformanceApiResponse, SessionPathPattern, UserJourneyStep } from '@/shared/lib/types';

type ClickHouseRow = Record<string, string | number | boolean | null | undefined>;

const DEFAULT_PROJECT_IDS = ['n9FlE09mPFlv', '6MZNYXghl1v8'];
const PURCHASE_EVENTS = ['purchase', 'mock_purchase', 'purchase_complete'];
const ADD_TO_CART_EVENTS = ['add_to_cart', 'click_add_to_cart'];
const CHECKOUT_EVENTS = ['checkout_click', 'checkout_start'];

const CLICKHOUSE_URL = process.env.DASHBOARD_RUM_CLICKHOUSE_URL;
const CLICKHOUSE_TABLE = process.env.DASHBOARD_RUM_CLICKHOUSE_TABLE ?? 'analytics.events';
const CLICKHOUSE_PROJECT_IDS = (process.env.DASHBOARD_RUM_PROJECT_IDS ?? DEFAULT_PROJECT_IDS.join(','))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseJsonEachRow(payload: string): ClickHouseRow[] {
  return payload
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ClickHouseRow);
}

async function queryClickHouse(query: string): Promise<ClickHouseRow[]> {
  if (!CLICKHOUSE_URL || CLICKHOUSE_PROJECT_IDS.length === 0) return [];

  try {
    const response = await fetch(CLICKHOUSE_URL, {
      method: 'POST',
      cache: 'no-store',
      body: query,
      signal: AbortSignal.timeout(4_000),
    });

    if (!response.ok) return [];
    return parseJsonEachRow(await response.text());
  } catch {
    return [];
  }
}

function buildTimeClause(params: URLSearchParams): string {
  const from = params.get('from');
  const to = params.get('to');
  const range = params.get('range');

  if (from && to) {
    return `AND created >= parseDateTimeBestEffort(${sqlString(from)}) AND created <= parseDateTimeBestEffort(${sqlString(to)})`;
  }

  if (range === '15m') return 'AND created >= now() - INTERVAL 15 MINUTE';
  if (range === '1h') return 'AND created >= now() - INTERVAL 1 HOUR';
  if (range === '24h') return 'AND created >= now() - INTERVAL 24 HOUR';
  if (range === '7d') return 'AND created >= now() - INTERVAL 7 DAY';
  return '';
}

function pathPageType(path: string): PageType {
  if (path === '/cart' || path.startsWith('/checkout')) return 'checkout';
  if (path.startsWith('/product/')) return 'product';
  return 'main';
}

function pathStepLabel(path: string): string {
  if (path === '/') return '메인 페이지';
  if (path.startsWith('/category/')) return '카테고리 탐색';
  if (path.startsWith('/product/')) return '상품 상세 조회';
  if (path === '/cart') return '장바구니 페이지';
  if (path === '/login') return '로그인 페이지';
  if (path === '/s/our-stores') return '매장 찾기';
  return '페이지 조회';
}

function normalizeRoute(route: unknown): string[] {
  return String(route ?? '')
    .split(' > ')
    .map((path) => path.trim() || '/')
    .filter(Boolean)
    .filter((path, index, paths) => index === 0 || path !== paths[index - 1]);
}

function addStep(steps: UserJourneyStep[], step: Omit<UserJourneyStep, 'dropoffRate' | 'avgTime'>, previous: number): number {
  if (steps.length > 0 && step.sessions <= 0 && step.step !== '구매 완료') return previous;

  const sessions = steps.length === 0 ? step.sessions : Math.min(previous, step.sessions);
  steps.push({
    ...step,
    sessions,
    dropoffRate: previous > 0 && steps.length > 0 ? round(((previous - sessions) / previous) * 100, 1) : 0,
    avgTime: 0,
  });

  return sessions;
}

function buildJourney(summary: ClickHouseRow): UserJourneyStep[] {
  const totalSessions = toNumber(summary.sessions);
  const categorySessions = toNumber(summary.category_sessions);
  const productSessions = toNumber(summary.product_sessions);
  const addToCartSessions = toNumber(summary.add_to_cart_sessions);
  const cartSessions = Math.max(toNumber(summary.cart_sessions), addToCartSessions);
  const checkoutSessions = toNumber(summary.checkout_sessions);
  const purchaseSessions = toNumber(summary.purchase_sessions);
  const steps: UserJourneyStep[] = [];
  let previous = totalSessions;

  previous = addStep(steps, { step: '방문 시작', sessions: totalSessions, pageType: 'main' }, previous);
  previous = addStep(steps, { step: '카테고리 탐색', sessions: categorySessions, pageType: 'main' }, previous);
  previous = addStep(steps, { step: '상품 상세 조회', sessions: productSessions, pageType: 'product' }, previous);
  previous = addStep(steps, { step: '장바구니 담기', sessions: addToCartSessions, pageType: 'product' }, previous);
  previous = addStep(steps, { step: '장바구니 페이지', sessions: cartSessions, pageType: 'checkout' }, previous);
  previous = addStep(steps, { step: '결제 진입', sessions: checkoutSessions, pageType: 'checkout' }, previous);
  addStep(steps, { step: '구매 완료', sessions: purchaseSessions, pageType: 'checkout' }, previous);

  return steps;
}

function buildPathPatterns(rows: ClickHouseRow[], totalSessions: number): SessionPathPattern[] {
  const mergedRows = new Map<string, { paths: string[]; sessions: number; hasPurchase: boolean }>();

  rows.forEach((row) => {
    const paths = normalizeRoute(row.route);
    if (paths.length === 0) return;

    const hasPurchase = Boolean(row.has_purchase);
    const key = `${hasPurchase ? 'purchase' : 'dropoff'}:${paths.join(' > ')}`;
    const current = mergedRows.get(key);

    if (current) {
      current.sessions += toNumber(row.sessions);
      return;
    }

    mergedRows.set(key, {
      paths,
      sessions: toNumber(row.sessions),
      hasPurchase,
    });
  });

  return Array.from(mergedRows.values())
    .sort((a, b) => Number(b.hasPurchase) - Number(a.hasPurchase) || b.sessions - a.sessions)
    .map((row, index) => {
      const { paths, sessions, hasPurchase } = row;
      const lastPath = paths.at(-1) ?? '/';
      const outcome = hasPurchase ? 'purchase' : 'dropoff';
      const isMainOnly = paths.length === 1 && paths[0] === '/';

      return {
        id: `rum-live-path-${index}-${paths.join('-').replace(/[^a-z0-9]+/gi, '-')}`,
        name: hasPurchase ? '구매 완료 경로' : isMainOnly ? '메인 페이지만 본 경로' : '대표 방문 경로',
        source: 'Swetrix pageview + custom event',
        device: 'Desktop',
        sessions,
        share: totalSessions > 0 ? round((sessions / totalSessions) * 100, 1) : 0,
        outcome,
        lastStep: hasPurchase ? '구매 완료' : pathStepLabel(lastPath),
        path: [
          ...paths.map((path) => ({
            step: pathStepLabel(path),
            event: path,
            pageType: pathPageType(path),
          })),
          ...(hasPurchase ? [{ step: '구매 완료', event: 'purchase_complete', pageType: 'checkout' as const }] : []),
        ],
      };
    });
}

function patchBusinessMetrics(metrics: BusinessMetrics, summary: ClickHouseRow): BusinessMetrics {
  const sessions = toNumber(summary.sessions);
  const purchases = toNumber(summary.purchase_sessions);

  return {
    ...metrics,
    conversionRate: {
      ...metrics.conversionRate,
      value: sessions > 0 ? round((purchases / sessions) * 100, 1) : 0,
      source: 'Swetrix purchase_complete event',
      isProxy: false,
    },
    deviceSegments: metrics.deviceSegments?.map((segment) => ({
      ...segment,
      purchases,
      conversionRate: sessions > 0 ? round((purchases / sessions) * 100, 1) : segment.conversionRate,
    })),
  };
}

export async function applyRumJourneyOverlay(
  data: PerformanceApiResponse,
  params: URLSearchParams,
): Promise<PerformanceApiResponse> {
  if (!CLICKHOUSE_URL) return data;

  const projectList = CLICKHOUSE_PROJECT_IDS.map(sqlString).join(', ');
  const purchaseList = PURCHASE_EVENTS.map(sqlString).join(', ');
  const addToCartList = ADD_TO_CART_EVENTS.map(sqlString).join(', ');
  const checkoutList = CHECKOUT_EVENTS.map(sqlString).join(', ');
  const timeClause = buildTimeClause(params);

  const [summaryRows, pathRows] = await Promise.all([
    queryClickHouse(`
      SELECT
        uniqExactIf(psid, type = 'pageview' AND psid IS NOT NULL) AS sessions,
        uniqExactIf(psid, type = 'pageview' AND psid IS NOT NULL AND startsWith(ifNull(pg, ''), '/category/')) AS category_sessions,
        uniqExactIf(psid, type = 'pageview' AND psid IS NOT NULL AND startsWith(ifNull(pg, ''), '/product/')) AS product_sessions,
        uniqExactIf(psid, event_name IN (${addToCartList}) AND psid IS NOT NULL) AS add_to_cart_sessions,
        uniqExactIf(psid, type = 'pageview' AND psid IS NOT NULL AND ifNull(pg, '') = '/cart') AS cart_sessions,
        uniqExactIf(psid, event_name IN (${checkoutList}) AND psid IS NOT NULL) AS checkout_sessions,
        uniqExactIf(psid, event_name IN (${purchaseList}) AND psid IS NOT NULL) AS purchase_sessions
      FROM ${CLICKHOUSE_TABLE}
      WHERE pid IN (${projectList})
        ${timeClause}
      FORMAT JSONEachRow
    `),
    queryClickHouse(`
      SELECT
        route,
        has_purchase,
        count() AS sessions
      FROM (
        SELECT
          psid,
          arrayMap(item -> item.2, arraySort(item -> item.1, groupArrayIf((created, ifNull(pg, '/')), type = 'pageview'))) AS ordered_paths,
          arrayStringConcat(arraySlice(ordered_paths, 1, 6), ' > ') AS route,
          countIf(event_name IN (${purchaseList})) > 0 AS has_purchase
        FROM ${CLICKHOUSE_TABLE}
        WHERE pid IN (${projectList})
          ${timeClause}
          AND psid IS NOT NULL
        GROUP BY psid
        HAVING length(ordered_paths) > 0
      )
      GROUP BY route, has_purchase
      ORDER BY has_purchase DESC, sessions DESC
      LIMIT 30
      FORMAT JSONEachRow
    `),
  ]);

  const summary = summaryRows[0];
  if (!summary) return data;

  const sessions = toNumber(summary.sessions);
  const userJourney = buildJourney(summary);
  const sessionPaths = buildPathPatterns(pathRows, sessions);

  return {
    ...data,
    businessMetrics: patchBusinessMetrics(data.businessMetrics ?? {}, summary),
    rum: {
      ...data.rum,
      userJourney,
      sessionPaths,
    },
  };
}
