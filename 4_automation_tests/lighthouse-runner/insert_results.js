import fs from 'fs';
import pg from 'pg';

const { Client } = pg;

const RESULTS_DIR = '/abr/coss41/shared_workspace/phoo_workspace/codebase/luminara-dashboard/4_automation_tests/lighthouse-runner/results';

const client = new Client({
  host: process.env.POSTGRES_HOST || '/pg_socket',
  user: process.env.POSTGRES_USER || 'lumin_admin',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'core_db',
});

const PAGES = [
  { pageName: 'main',        url: 'https://www.decathlon.co.kr/',          siteType: 'decathlon',  competitorName: null },
  { pageName: 'cart',        url: 'https://www.decathlon.co.kr/cart',      siteType: 'decathlon',  competitorName: null },
  { pageName: 'category',    url: 'https://www.decathlon.co.kr/c/first-choice.html?itm_source=hp&itm_medium=circlebanner&itm_campaign=firstchoice-260306', siteType: 'decathlon', competitorName: null },
  { pageName: 'product',     url: 'https://www.decathlon.co.kr/p/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.html', siteType: 'decathlon', competitorName: null },
  { pageName: 'nike',        url: 'https://www.nike.com/kr',               siteType: 'competitor', competitorName: 'nike' },
  { pageName: 'underarmour', url: 'https://www.underarmour.co.kr/ko-kr/', siteType: 'competitor', competitorName: 'underarmour' },
  { pageName: 'fila',        url: 'https://www.fila.co.kr/',               siteType: 'competitor', competitorName: 'fila' },
];

const RUNS_PER_PAGE = 3;
const TOTAL_TESTS   = PAGES.length * RUNS_PER_PAGE;

function extractMetrics(lhr) {
  const a = lhr.audits;
  const categories = lhr.categories;

  return {
    lcp_ms:               a['largest-contentful-paint']?.numericValue               ?? null,
    tbt_ms:               a['total-blocking-time']?.numericValue                    ?? null,
    cls_score:            a['cumulative-layout-shift']?.numericValue                ?? null,
    fcp_ms:               a['first-contentful-paint']?.numericValue                 ?? null,
    si_ms:                a['speed-index']?.numericValue                            ?? null,
    tti_ms:               a['interactive']?.numericValue                            ?? null,
    ttfb_ms:              a['server-response-time']?.numericValue                   ?? null,
    inp_ms:               a['experimental-interaction-to-next-paint']?.numericValue ?? null,
    performance_score:    typeof categories?.performance?.score === 'number'
                            ? categories.performance.score * 100 : null,
    accessibility_score:  typeof categories?.accessibility?.score === 'number'
                            ? categories.accessibility.score * 100 : null,
    best_practices_score: typeof categories?.['best-practices']?.score === 'number'
                            ? categories['best-practices'].score * 100 : null,
    seo_score:            typeof categories?.seo?.score === 'number'
                            ? categories.seo.score * 100 : null,
  };
}

async function main() {
  await client.connect();
  console.log('Connected to core_db');

  let successCount = 0;
  let failedCount  = 0;

  const startedAt = new Date();
  const pwRes = await client.query(
    `INSERT INTO playwright_runs
       (run_type, url, device_type, started_at, total_tests,
        success_count, failed_count, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      'decathlon_daily',
      'https://www.decathlon.co.kr',
      'mobile',           // FIX: was 'desktop', audit runs mobile throttling
      startedAt,
      TOTAL_TESTS,
      0,
      0,
      'running',          // FIX: start as running, update to completed after loop
    ]
  );
  const playwrightRunId = pwRes.rows[0].id;
  console.log(`playwright_runs inserted — id: ${playwrightRunId}`);

  for (const page of PAGES) {
    console.log(`\nProcessing page: ${page.pageName}`);

    for (let runNumber = 1; runNumber <= RUNS_PER_PAGE; runNumber++) {
      // FIX: filename matches run_lighthouse.js output (_raw suffix)
      const filePath = `${RESULTS_DIR}/${page.pageName}_run${runNumber}_raw.json`;

      if (!fs.existsSync(filePath)) {
        console.warn(`  File not found: ${filePath} — skipping`);
        failedCount++;
        continue;
      }

      // FIX: per-run try/catch so one bad file doesn't crash everything
      try {
        const lhr       = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const metrics   = extractMetrics(lhr);
        const timestamp = lhr.fetchTime ? new Date(lhr.fetchTime) : new Date();

        const lhRes = await client.query(
          `INSERT INTO lighthouse_runs
             (playwright_run_id, url, site_type, competitor_name, page_type,
              device_type, network_profile, run_number, timestamp,
              lcp_ms, tbt_ms, cls_score, fcp_ms, si_ms, tti_ms,
              ttfb_ms, inp_ms, performance_score, accessibility_score,
              best_practices_score, seo_score)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
           RETURNING test_id`,
          [
            playwrightRunId,
            page.url,
            page.siteType,
            page.competitorName,
            page.pageName,
            'mobile',     // FIX: was 'desktop'
            'WiFi',
            runNumber,
            timestamp,
            metrics.lcp_ms,
            metrics.tbt_ms,
            metrics.cls_score,
            metrics.fcp_ms,
            metrics.si_ms,
            metrics.tti_ms,
            metrics.ttfb_ms,
            metrics.inp_ms,
            metrics.performance_score,
            metrics.accessibility_score,
            metrics.best_practices_score,
            metrics.seo_score,
          ]
        );
        const testId = lhRes.rows[0].test_id;
        console.log(`  lighthouse_runs inserted — test_id: ${testId} (run ${runNumber})`);

        await client.query(
          `INSERT INTO lighthouse_raw_reports (test_id, raw_json)
           VALUES ($1, $2)`,
          [testId, JSON.stringify(lhr)]
        );
        console.log(`  lighthouse_raw_reports inserted — run ${runNumber}`);

        successCount++;

      } catch (err) {
        console.error(`  Failed run ${runNumber} for ${page.pageName}: ${err.message}`);
        failedCount++;
      }
    }
  }

  // FIX: update with real counts and completed status
  await client.query(
    `UPDATE playwright_runs
     SET finished_at   = $1,
         success_count = $2,
         failed_count  = $3,
         status        = $4
     WHERE id = $5`,
    [new Date(), successCount, failedCount, 'completed', playwrightRunId]
  );

  console.log(`\nAll done — success: ${successCount}, failed: ${failedCount}`);
  console.log('All data inserted into core_db successfully');
}

// FIX: always close DB connection even if main() throws
main()
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  })
  .finally(() => {
    client.end();
  });
