module.exports = {
  ci: {
    collect: {
      url: [
        // Decathlon clone pages (used in GHA automated pipeline)
        `${process.env.LHCI_COLLECT_URL}`,
        `${process.env.LHCI_COLLECT_URL}cart`,
        `${process.env.LHCI_COLLECT_URL}category/first-choice`,
        `${process.env.LHCI_COLLECT_URL}product/8960456`,

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
    preset: 'lighthouse:no-pwa',
    assertions: {
    // CWV — warn if regression from previous build
    'largest-contentful-paint': ['warn', { maxNumericValue: 2500, aggregationMethod: 'optimistic' }],
    'cumulative-layout-shift':  ['warn', { maxNumericValue: 0.1,  aggregationMethod: 'optimistic' }],
    'first-contentful-paint':   ['warn', { maxNumericValue: 1800, aggregationMethod: 'optimistic' }],
    'total-blocking-time':      ['warn', { maxNumericValue: 200,  aggregationMethod: 'optimistic' }],
    'speed-index':              ['warn', { maxNumericValue: 3400, aggregationMethod: 'optimistic' }],

    // Scores
    'categories:performance':   ['warn', { minScore: 0.9, aggregationMethod: 'optimistic' }],
    'categories:accessibility': ['warn', { minScore: 0.9, aggregationMethod: 'optimistic' }],
    'categories:best-practices':['warn', { minScore: 0.9, aggregationMethod: 'optimistic' }],
    'categories:seo':           ['warn', { minScore: 0.9, aggregationMethod: 'optimistic' }],
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
