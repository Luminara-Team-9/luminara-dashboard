import { chromium } from 'playwright';
import fs from 'fs';

const BASE_URL = process.env.LHCI_COLLECT_URL || 'http://155.230.135.209:3002/';

async function runUserJourney() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  const results = [];

  console.log('Starting clone user journey audit...');
  console.log('Base URL: ' + BASE_URL);

  const steps = [
    { name: 'main',     url: `${BASE_URL}` },
    { name: 'category', url: `${BASE_URL}category/first-choice` },
    { name: 'product',  url: `${BASE_URL}product/8960456` },
    { name: 'cart',     url: `${BASE_URL}cart` },
  ];

  for (const step of steps) {
    try {
      const start = Date.now();
      await page.goto(step.url, { waitUntil: 'networkidle', timeout: 30000 });
      const loadTime = Date.now() - start;

      await page.screenshot({
        path: `./results/screenshot_${step.name}.png`,
        fullPage: false,
      });

      results.push({
        step: step.name,
        url: step.url,
        loadTime,
        status: loadTime <= 2500 ? 'Good' :
                loadTime <= 4000 ? 'Needs Improvement' : 'Poor',
      });

      console.log(step.name + ': ' + loadTime + 'ms -> ' + results[results.length - 1].status);

    } catch (error) {
      console.error(step.name + ' failed: ' + error.message);
      results.push({
        step: step.name,
        url: step.url,
        loadTime: null,
        status: 'Error',
        error: error.message,
      });
    }
  }

  fs.mkdirSync('./results', { recursive: true });
  fs.writeFileSync(
    './results/journey_results.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n=== CLONE USER JOURNEY SUMMARY ===');
  results.forEach(r => {
    console.log('  ' + r.step + ': ' + (r.loadTime ?? 'null') + 'ms -> ' + r.status);
  });

  console.log('\nJourney results saved to ./results/journey_results.json');
  await browser.close();
}

runUserJourney();
