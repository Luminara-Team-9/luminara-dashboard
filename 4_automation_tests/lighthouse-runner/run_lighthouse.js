import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import fs from 'fs';

const CHROME_PATH = '/usr/lib/playwright/chromium-1217/chrome-linux64/chrome';

const PHOO_PORT = 9227;

const PAGES = [
  { pageName: 'main', url: 'https://www.decathlon.co.kr/' },
  { pageName: 'cart', url: 'https://www.decathlon.co.kr/cart' },
];

const RUNS_PER_PAGE = 3;

function extractMetrics(lhr, pageName, url, runNumber) {
  const a = lhr.audits;
  return {
    pageName,
    url,
    runNumber,
    fcp_ms:        a['first-contentful-paint']?.numericValue   ?? null,
    lcp_ms:        a['largest-contentful-paint']?.numericValue ?? null,
    speedIndex_ms: a['speed-index']?.numericValue              ?? null,
    tbt_ms:        a['total-blocking-time']?.numericValue      ?? null,
    cls_score:     a['cumulative-layout-shift']?.numericValue  ?? null,
    score:
      typeof lhr.categories?.performance?.score === 'number'
        ? lhr.categories.performance.score * 100
        : null,
  };
}

function extractOpportunities(lhr) {
  const opportunities = [];
  for (const [auditId, audit] of Object.entries(lhr.audits)) {
    if (
      audit?.details?.type === 'opportunity' &&
      audit?.score !== null &&
      audit?.score < 1
    ) {
      opportunities.push({
        audit_id:    auditId,
        title:       audit.title,
        description: audit.description,
        score:       audit.score,
        savings_ms:  audit.details?.overallSavingsMs ?? null,
        details:     audit.details,
      });
    }
  }
  return opportunities;
}

function averageMetric(results, key) {
  const values = results
    .map((r) => r[key])
    .filter((v) => typeof v === 'number');
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function runAudit(pageInfo, runNumber) {
  console.log(`Auditing: ${pageInfo.pageName} - run ${runNumber}/${RUNS_PER_PAGE}`);

  const chrome = await launch({
    chromePath: CHROME_PATH,
    port: PHOO_PORT,
    chromeFlags: [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--ignore-certificate-errors',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
    ],
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    const runnerResult = await lighthouse(pageInfo.url, {
      port: chrome.port,
      output: 'json',
      onlyCategories: ['performance'],
      formFactor: 'mobile',
      screenEmulation: {
        mobile:            true,
        width:             412,
        height:            823,
        deviceScaleFactor: 1.75,
        disabled:          false,
      },
      throttlingMethod: 'simulate',
      throttling: {
        rttMs:                  150,
        throughputKbps:         1638.4,
        cpuSlowdownMultiplier:  4,
        requestLatencyMs:       562.5,
        downloadThroughputKbps: 1474.56,
        uploadThroughputKbps:   675,
      },
      settings: {
        maxWaitForLoad:      90000,
        disableStorageReset: false,
      },
    });

    const lhr = runnerResult.lhr;

    if (lhr.runtimeError) {
      console.error(`  Runtime error: ${lhr.runtimeError.message}`);
      return {
        metrics: {
          pageName: pageInfo.pageName, url: pageInfo.url, runNumber,
          fcp_ms: null, lcp_ms: null, speedIndex_ms: null,
          tbt_ms: null, cls_score: null, score: null,
        },
        lhr: null,
      };
    }

    const rawPath = `./results/${pageInfo.pageName}_run${runNumber}_raw.json`;
    fs.writeFileSync(rawPath, JSON.stringify(lhr, null, 2));
    console.log(`  Raw JSON saved -> ${rawPath}`);

    const metrics = extractMetrics(lhr, pageInfo.pageName, pageInfo.url, runNumber);
    console.log(`  Metrics:`, metrics);

    return { metrics, lhr };

  } catch (error) {
    console.error(`  Error: ${error.message}`);
    return {
      metrics: {
        pageName: pageInfo.pageName, url: pageInfo.url, runNumber,
        fcp_ms: null, lcp_ms: null, speedIndex_ms: null,
        tbt_ms: null, cls_score: null, score: null,
        error: error.message,
      },
      lhr: null,
    };
  } finally {
    await chrome.kill();
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

async function main() {
  fs.mkdirSync('./results', { recursive: true });

  const summary = [];

  for (const pageInfo of PAGES) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`PAGE: ${pageInfo.pageName.toUpperCase()} - ${pageInfo.url}`);
    console.log('='.repeat(50));

    const allMetrics = [];
    let lastLhr = null;

    for (let i = 1; i <= RUNS_PER_PAGE; i++) {
      const { metrics, lhr } = await runAudit(pageInfo, i);
      allMetrics.push(metrics);
      if (lhr) lastLhr = lhr;
    }

    const avg = {
      fcp_ms:        averageMetric(allMetrics, 'fcp_ms'),
      lcp_ms:        averageMetric(allMetrics, 'lcp_ms'),
      speedIndex_ms: averageMetric(allMetrics, 'speedIndex_ms'),
      tbt_ms:        averageMetric(allMetrics, 'tbt_ms'),
      cls_score:     averageMetric(allMetrics, 'cls_score'),
      score:         averageMetric(allMetrics, 'score'),
    };

    const opportunities = lastLhr ? extractOpportunities(lastLhr) : [];

    const pageResult = {
      page:          pageInfo.pageName,
      url:           pageInfo.url,
      runs:          allMetrics,
      average:       avg,
      opportunities,
    };

    summary.push(pageResult);

    fs.writeFileSync(
      `./results/${pageInfo.pageName}_summary.json`,
      JSON.stringify(pageResult, null, 2),
    );

    console.log(`\nAVERAGE for ${pageInfo.pageName}:`);
    console.log(`  Performance Score : ${avg.score?.toFixed(1)     ?? 'null'}`);
    console.log(`  FCP               : ${avg.fcp_ms?.toFixed(0)    ?? 'null'} ms`);
    console.log(`  LCP               : ${avg.lcp_ms?.toFixed(0)    ?? 'null'} ms`);
    console.log(`  TBT               : ${avg.tbt_ms?.toFixed(0)    ?? 'null'} ms`);
    console.log(`  CLS               : ${avg.cls_score?.toFixed(4) ?? 'null'}`);
    console.log(`  Opportunities     : ${opportunities.length} found`);
  }

  fs.writeFileSync(
    './results/summary_average.json',
    JSON.stringify(summary, null, 2),
  );

  console.log('\nALL AUDITS FINISHED');
  console.log('Results saved in ./results/');
}

main();