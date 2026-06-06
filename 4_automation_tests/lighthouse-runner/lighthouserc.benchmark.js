module.exports = {
  ci: {
    collect: {
      url: [
        // Live Decathlon pages
        'https://www.decathlon.co.kr/',
        'https://www.decathlon.co.kr/cart',
        'https://www.decathlon.co.kr/c/first-choice.html?itm_source=hp&itm_medium=circlebanner&itm_campaign=firstchoice-260306',
        'https://www.decathlon.co.kr/p/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.html',

        // Competitors
        'https://www.nike.com/kr',
        'https://www.underarmour.co.kr/ko-kr/',
        'https://www.fila.co.kr/',
      ],
      numberOfRuns: 5,
      settings: {
        chromeFlags: '--headless --no-sandbox --disable-gpu',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 1.75,
          disabled: false,
        },
        throttlingMethod: 'simulate',
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
          requestLatencyMs: 562.5,
          downloadThroughputKbps: 1474.56,
          uploadThroughputKbps: 675,
        },
        maxWaitForLoad: 180000,
      },
    },
    assert: {
      assertions: {
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift':  ['warn', { maxNumericValue: 0.1 }],
        'first-contentful-paint':   ['warn', { maxNumericValue: 1800 }],
        'total-blocking-time':      ['warn', { maxNumericValue: 200 }],
        'speed-index':              ['warn', { maxNumericValue: 3400 }],
        'categories:performance':   ['warn', { minScore: 0.9 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'categories:best-practices':['warn', { minScore: 0.9 }],
        'categories:seo':           ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'lhci',
      serverBaseUrl: `http://${process.env.LHCI_USER}:${process.env.LHCI_PASS}@155.230.135.209:9001`,
      token: process.env.LHCI_BUILD_TOKEN,
      ignoreDuplicateBuildFailure: true,
    },
  },
};
