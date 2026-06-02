import { chromium } from 'playwright';
import fs from 'fs';

const BASE_URL = 'https://www.decathlon.co.kr/';

async function runLiveJourney() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  const results = [];

  console.log('Starting live Decathlon user journey audit...');
  console.log('Base URL: ' + BASE_URL);

  const steps = [
    { name: 'main',     url: BASE_URL },
    { name: 'category', url: BASE_URL + 'c/first-choice.html?itm_source=hp&itm_medium=circlebanner&itm_campaign=firstchoice-260306' },
    { name: 'product',  url: BASE_URL + 'p/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.html' },
    { name: 'cart',     url: BASE_URL + 'cart' },
  ];

  for (const step of steps) {
    try {
      const start = Date.now();
      await page.goto(step.url, { waitUntil: 'networkidle', timeout: 60000 });
      const loadTime = Date.now() - start;

      await page.screenshot({
        path: './results/live_screenshot_' + step.name + '.png',
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
    './results/live_journey_results.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n=== LIVE DECATHLON USER JOURNEY SUMMARY ===');
  results.forEach(r => {
    console.log('  ' + r.step + ': ' + (r.loadTime ?? 'null') + 'ms -> ' + r.status);
  });

  console.log('\nJourney results saved to ./results/live_journey_results.json');
  await browser.close();
}

runLiveJourney();
