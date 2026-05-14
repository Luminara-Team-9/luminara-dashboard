module.exports = {
  ci: {
    collect: {
      url: [
        process.env.LHCI_COLLECT_URL,
        `${process.env.LHCI_COLLECT_URL}cart`,
        `${process.env.LHCI_COLLECT_URL}category/first-choice`,
        `${process.env.LHCI_COLLECT_URL}product/8960456`
      ],
      numberOfRuns: 5,
      settings: {
        chromeFlags: '--no-sandbox --disable-gpu --headless',
        onlyCategories: ['performance']
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'resource-summary:mainthread-work-breakdown:count': ['warn', { maxNumericValue: 20 }],

        // 2. ADD THIS: Force the audit to fail if the page is empty
        'dom-size': ['error', { minNumericValue: 10 }], 
        'network-requests': ['error', { minNumericValue: 5 }]
      },
    },
    upload: {
      target: 'lhci',
      // Format: http://user:password@host:port
      serverBaseUrl: `http://${process.env.LHCI_USER}:${process.env.LHCI_PASS}@127.0.0.1:9001`,
      token: process.env.LHCI_BUILD_TOKEN,
    },
  },
};