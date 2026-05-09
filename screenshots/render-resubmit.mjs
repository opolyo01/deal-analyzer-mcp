import puppeteer from 'puppeteer';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, 'resubmit');
mkdirSync(outDir, { recursive: true });

const pages = [
  { file: 'resubmit-analysis.html', out: 'deal-analyzer-resubmit-1.png', height: 840 },
  { file: 'resubmit-saved.html', out: 'deal-analyzer-resubmit-2.png', height: 760 },
  { file: 'resubmit-compare.html', out: 'deal-analyzer-resubmit-3.png', height: 850 },
];

const browser = await puppeteer.launch({ headless: true });

for (const { file, out, height } of pages) {
  const page = await browser.newPage();
  await page.setViewport({ width: 706, height, deviceScaleFactor: 2 });
  await page.goto('file://' + resolve(__dirname, file));
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: resolve(outDir, out), fullPage: false });
  console.log('wrote', out);
  await page.close();
}

await browser.close();
