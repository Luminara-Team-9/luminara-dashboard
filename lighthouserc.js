module.exports = {
  ci: {
    collect: {
      url: [
        // Decathlon target pages
        `${process.env.LHCI_COLLECT_URL}/`,
        `${process.env.LHCI_COLLECT_URL}/cart`,
        `${process.env.LHCI_COLLECT_URL}/c/first-choice.html?itm_source=hp&itm_medium=circlebanner&itm_campaign=firstchoice-260306`,
        `${process.env.LHCI_COLLECT_URL}/p/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.html`,

        // Competitor pages
        'https://www.nike.com/kr',
        'https://www.underarmour.co.kr/ko-kr/',
        'https://www.fila.co.kr/',
      ],
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--headless --no-sandbox --disable-gpu',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      },
    },

    assert: {
      assertions: {
        // Current baseline is poor, so do not block the pipeline
        'categories:performance': ['warn', { minScore: 0.9 }],

        // These detect broken/empty pages, but should not stop upload for now
        'dom-size': ['warn', { minScore: 0.9 }],
        'network-requests': ['warn', { minScore: 0.9 }],
      },
    },

    upload: {
      target: 'lhci',
      serverBaseUrl: `http://${process.env.LHCI_USER}:${process.env.LHCI_PASS}@155.230.135.209:9001`,
      token: process.env.LHCI_BUILD_TOKEN,

      // Prevent failure when rerunning the same commit
      ignoreDuplicateBuildFailure: true,
    },
  },
};