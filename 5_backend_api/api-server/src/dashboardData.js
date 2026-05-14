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

async function fetchLatestLighthouseRows(pool) {
  const { rows } = await pool.query(`
    WITH ranked AS (
      SELECT
        lr.*,
        ROW_NUMBER() OVER (
          PARTITION BY lr.site_type, COALESCE(lr.competitor_name, ''), lr.page_type, lr.device_type
          ORDER BY lr.timestamp DESC, lr.test_id DESC
        ) AS row_rank
      FROM lighthouse_runs lr
      WHERE lr.device_type = COALESCE($1, lr.device_type)
    )
    SELECT *
    FROM ranked
    WHERE row_rank = 1
    ORDER BY timestamp DESC, test_id DESC
  `, [process.env.DASHBOARD_DEVICE_TYPE ?? 'desktop']);

  return rows;
}

async function fetchTrendRows(pool) {
  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(timestamp::date, 'YYYY-MM-DD') AS label,
      site_type,
      competitor_name,
      AVG(performance_score) AS performance_score
    FROM lighthouse_runs
    WHERE performance_score IS NOT NULL
    GROUP BY timestamp::date, site_type, competitor_name
    ORDER BY timestamp::date ASC
  `);

  return rows;
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
    fetchLatestLighthouseRows(pool),
    fetchTrendRows(pool),
    fetchAiPlans(pool),
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
        source: 'core_db.lighthouse_runs',
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
