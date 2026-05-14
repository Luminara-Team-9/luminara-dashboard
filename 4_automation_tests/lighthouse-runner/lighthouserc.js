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
        'resource-summary:mainthread-work-breakdown:count': ['warn', { maxNumericValue: 20 }]
      },
    },
    upload: {
      target: 'lhci',
      serverBaseUrl: 'http://127.0.0.1:9001',
      token: process.env.LHCI_BUILD_TOKEN,
    },
  },
};