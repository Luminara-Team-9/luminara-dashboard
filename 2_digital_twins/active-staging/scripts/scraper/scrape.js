const { chromium } = require('playwright');
const fs = require('fs');

const PAGES = [
  {
    name: 'homepage',
    url: 'https://www.decathlon.co.kr/',
  },
  {
    name: 'category',
    url: 'https://www.decathlon.co.kr/c/first-choice.html',
  },
  {
    name: 'pdp',
    url: 'https://www.decathlon.co.kr/p/남성-러닝-반팔-티-런-드라이-100-decathlon-8488034.html',
  },
  {
    name: 'cart',
    url: 'https://www.decathlon.co.kr/cart',
  },
];

async function scrapePage(page, name, url) {
  console.log(`\n📄 Scraping ${name}: ${url}`);
  const dir = `./scraped/${name}`;
  fs.mkdirSync(dir, { recursive: true });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Full rendered HTML
  const html = await page.content();
  fs.writeFileSync(`${dir}/page.html`, html);
  console.log(`  ✓ HTML saved (${(html.length/1024).toFixed(1)}kb)`);

  // Full page screenshot
  await page.screenshot({ path: `${dir}/screenshot.png`, fullPage: true });
  console.log(`  ✓ Screenshot saved`);

  // All CSS
  const css = await page.evaluate(() => {
    return Array.from(document.styleSheets).map(sheet => {
      try {
        return Array.from(sheet.cssRules || [])
          .map(rule => rule.cssText).join('\n');
      } catch { return `/* External: ${sheet.href} */`; }
    }).join('\n\n');
  });
  fs.writeFileSync(`${dir}/styles.css`, css);
  console.log(`  ✓ CSS saved (${(css.length/1024).toFixed(1)}kb)`);

  // Page structure
  const structure = await page.evaluate(() => {
    function extract(el, depth = 0) {
      if (depth > 4) return null;
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: el.className?.toString().trim().split(/\s+/).slice(0, 5) || [],
        text: el.children.length === 0
          ? el.textContent?.trim().slice(0, 80)
          : null,
        children: Array.from(el.children)
          .map(c => extract(c, depth + 1))
          .filter(Boolean),
      };
    }
    return extract(document.body);
  });
  fs.writeFileSync(
    `${dir}/structure.json`,
    JSON.stringify(structure, null, 2)
  );
  console.log(`  ✓ Structure saved`);

  // All links
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map(a => ({
      text: a.textContent?.trim().slice(0, 60),
      href: a.getAttribute('href'),
      section: a.closest('header') ? 'header'
             : a.closest('nav')    ? 'nav'
             : a.closest('footer') ? 'footer'
             : 'body',
    })).filter(l => l.text && l.href).slice(0, 100)
  );
  fs.writeFileSync(`${dir}/links.json`, JSON.stringify(links, null, 2));
  console.log(`  ✓ Links saved (${links.length} found)`);

  // All images
  const images = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img')).map(img => ({
      src: img.src,
      alt: img.alt,
      width: img.naturalWidth,
      height: img.naturalHeight,
    })).filter(i => i.src).slice(0, 50)
  );
  fs.writeFileSync(`${dir}/images.json`, JSON.stringify(images, null, 2));
  console.log(`  ✓ Images catalogued (${images.length} found)`);
}

(async () => {
  console.log('🚀 Decathlon Scraper Starting...\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
  });

  const page = await context.newPage();

  for (const { name, url } of PAGES) {
    try {
      await scrapePage(page, name, url);
    } catch (err) {
      console.error(`  ✗ Failed ${name}:`, err.message);
    }
  }

  await browser.close();
  console.log('\n✅ Done! Check ./scraped/ for output');
  console.log('   Open scraped/homepage/screenshot.png first!');
})();
