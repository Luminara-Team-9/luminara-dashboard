const TARGET_LIGHTHOUSE_SCORE = 90;

const METRIC_TARGETS = {
  lcp: { target: 2.5, unit: 's', label: 'LCP' },
  cls: { target: 0.1, unit: 'score', label: 'CLS' },
  inp: { target: 200, unit: 'ms', label: 'INP' },
  tbt: { target: 200, unit: 'ms', label: 'TBT' },
  fcp: { target: 1.8, unit: 's', label: 'FCP' },
  speedIndex: { target: 3.4, unit: 's', label: 'Speed Index' },
  assetSize: { target: 450, unit: 'KB', label: 'Asset Size' },
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

function msToSeconds(value) {
  return round(toNumber(value) / 1000, 2);
}

function normalizeBrand(row) {
  if (row.site_type === 'target' || row.site_type === 'decathlon') return 'Decathlon';
  const name = row.competitor_name || row.site_type || 'Competitor';
  const lower = name.toLowerCase();
  if (lower === 'nike') return 'Nike Korea';
  if (lower === 'ssg') return 'SSG';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function classifyUrl(url) {
  const value = String(url ?? '').toLowerCase();

  if (value.includes('nike.com')) {
    return { site_type: 'competitor', competitor_name: 'nike', page_type: 'nike' };
  }

  if (value.includes('ssg.com')) {
    return { site_type: 'competitor', competitor_name: 'ssg', page_type: 'ssg' };
  }

  let pageType = 'main';
  if (value.includes('/cart')) pageType = 'cart';
  else if (value.includes('/products/') || value.includes('/p/')) pageType = 'product';
  else if (value.includes('/c/') || value.includes('category')) pageType = 'category';

  return { site_type: 'decathlon', competitor_name: null, page_type: pageType };
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

function buildMetrics(row) {
  return {
    lcp: { value: msToSeconds(row.lcp_ms), ...METRIC_TARGETS.lcp },
    cls: { value: round(row.cls_score, 3), ...METRIC_TARGETS.cls },
    inp: { value: round(row.inp_ms), ...METRIC_TARGETS.inp },
    tbt: { value: round(row.tbt_ms), ...METRIC_TARGETS.tbt },
    fcp: { value: msToSeconds(row.fcp_ms), ...METRIC_TARGETS.fcp },
    speedIndex: { value: msToSeconds(row.si_ms), ...METRIC_TARGETS.speedIndex },
    assetSize: { value: round(row.page_size_kb), ...METRIC_TARGETS.assetSize },
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
          ORDER BY r.representative DESC, r."createdAt" DESC
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

export async function getDashboardPerformanceData(pool) {
  const [latestRows, trendRows, aiPlanRows] = await Promise.all([
    fetchLatestLighthouseRows(pool.lhci),
    fetchTrendRows(pool.lhci),
    fetchAiPlans(pool.core),
  ]);

  const preferredTargetSiteType = latestRows.some((row) => row.site_type === 'target') ? 'target' : 'decathlon';
  const targetRows = latestRows.filter((row) => row.site_type === preferredTargetSiteType);
  const targetMain = targetRows.find((row) => row.page_type === 'main') ?? targetRows[0] ?? latestRows[0];
  const benchmarkSeed = new Map();

  latestRows.forEach((row) => {
    const brand = normalizeBrand(row);
    if (!benchmarkSeed.has(brand) || row.page_type === 'main') {
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
      regionalData: [],
      userJourney: [],
      sessionPaths: [],
    },
    aiFixPlans: aiPlanRows.map(buildAiPlan),
  };
}
