import fs from 'fs';

const API_KEY = process.env.PSI_API_KEY;

const PAGES = [
  { pageName: 'main',        url: 'https://www.decathlon.co.kr/' },
  { pageName: 'cart',        url: 'https://www.decathlon.co.kr/cart' },
  { pageName: 'category',    url: 'https://www.decathlon.co.kr/c/first-choice.html?itm_source=hp&itm_medium=circlebanner&itm_campaign=firstchoice-260306' },
  { pageName: 'product',     url: 'https://www.decathlon.co.kr/p/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.html' },
  { pageName: 'nike',        url: 'https://www.nike.com/kr' },
  { pageName: 'underarmour', url: 'https://www.underarmour.co.kr/ko-kr/' },
  { pageName: 'fila',        url: 'https://www.fila.co.kr/' },
  { pageName: 'ssg',         url: 'https://www.ssg.com/' },
];

async function fetchPSI(pageName, url) {
  console.log('Fetching INP for: ' + pageName);
  const apiUrl = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=' + encodeURIComponent(url) + '&strategy=mobile&key=' + API_KEY;

  const res = await fetch(apiUrl);
  const data = await res.json();

  if (data.error) {
    console.error('  Error: ' + data.error.message);
    return null;
  }

  const crux = data.loadingExperience && data.loadingExperience.metrics;

  const metrics = {
    pageName: pageName,
    url: url,
    timestamp: new Date().toISOString(),
    inp_ms: crux && crux.INTERACTION_TO_NEXT_PAINT ? crux.INTERACTION_TO_NEXT_PAINT.percentile : null,
    inp_category: crux && crux.INTERACTION_TO_NEXT_PAINT ? crux.INTERACTION_TO_NEXT_PAINT.category : null,
  };

  console.log('  INP: ' + (metrics.inp_ms || 'null') + ' ms -> ' + (metrics.inp_category || 'no field data'));

  return metrics;
}

async function main() {
  if (!API_KEY) {
    console.error('PSI_API_KEY environment variable not set!');
    process.exit(1);
  }

  fs.mkdirSync('./results', { recursive: true });

  var summary = [];

  for (var i = 0; i < PAGES.length; i++) {
    var page = PAGES[i];
    var metrics = await fetchPSI(page.pageName, page.url);
    if (metrics) {
      summary.push(metrics);
      fs.writeFileSync('./results/psi_' + page.pageName + '.json', JSON.stringify(metrics, null, 2));
    }
    await new Promise(function(r) { setTimeout(r, 2000); });
  }

  fs.writeFileSync('./results/psi_summary.json', JSON.stringify(summary, null, 2));
  console.log('\nPSI AUDIT COMPLETE - results saved to ./results/');
}

main();
