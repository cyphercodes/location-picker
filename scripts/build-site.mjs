// Assembles the GitHub Pages site into _site/ (CONTRACT §11.1, WP6): the pages in site/, the script build and its
// stylesheet from dist/, a local copy of Leaflet (the site never loads code from a CDN), and compat/compat.json when
// the compatibility workflow produced one. Run `npm run build` first.
//
//   node scripts/build-site.mjs        build _site/
//   node scripts/build-site.mjs --og   render site/og.png (1200x630) from the card below with Playwright Chromium
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '_site';
const DIST = 'dist';
const LEAFLET = 'node_modules/leaflet/dist';

async function buildSite() {
  const iife = join(DIST, 'location-picker.global.js');
  if (!existsSync(iife)) {
    console.error(`build-site: ${iife} is missing. Run \`npm run build\` first.`);
    process.exit(1);
  }
  await rm(OUT, { recursive: true, force: true });
  await cp('site', OUT, { recursive: true });
  await cp(iife, join(OUT, 'location-picker.global.js'));
  await cp(join(DIST, 'location-picker.css'), join(OUT, 'location-picker.css'));
  await mkdir(join(OUT, 'vendor/leaflet'), { recursive: true });
  for (const file of ['leaflet.js', 'leaflet.css', 'images']) {
    await cp(join(LEAFLET, file), join(OUT, 'vendor/leaflet', file), { recursive: true });
  }
  // Leaflet is BSD-2-Clause: its licence travels with the copy.
  await cp(join(LEAFLET, '../LICENSE'), join(OUT, 'vendor/leaflet/LICENSE'));
  if (existsSync('compat/compat.json')) {
    await cp('compat/compat.json', join(OUT, 'compat/compat.json'));
  }
  // Pages deployed by Actions skip Jekyll already; this keeps a branch-based deploy from dropping files too.
  await writeFile(join(OUT, '.nojekyll'), '');
  const { size } = await stat(join(OUT, 'location-picker.global.js'));
  console.log(`build-site: ${OUT}/ ready (script build ${size} bytes)`);
}

/** The Open Graph card, rendered once and committed as site/og.png (pages.yml never launches a browser). */
async function renderOgImage(file) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(OG_CARD, { waitUntil: 'load' });
    await page.screenshot({ path: file, type: 'png' });
    console.log(`build-site: wrote ${file}`);
  } finally {
    await browser.close();
  }
}

const PIN = `<svg viewBox="0 0 28 44" width="112" height="176" aria-hidden="true">
  <path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 44 14 44s14-19.7 14-30.1C28 6.2 21.7 0 14 0z" fill="#f43f5e"/>
  <circle cx="14" cy="14" r="5.5" fill="#fff"/></svg>`;

const OG_CARD = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #f8fafc; background: #0b1120; position: relative; }
  .map { position: absolute; inset: 0 0 0 560px; background:
      radial-gradient(circle at 50% 46%, rgba(244,63,94,.28), transparent 38%),
      linear-gradient(#0b1120 0 0) padding-box; }
  .grid { position: absolute; inset: 0 0 0 560px; opacity: .55; background-image:
      linear-gradient(rgba(148,163,184,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.16) 1px, transparent 1px);
      background-size: 48px 48px; mask-image: radial-gradient(circle at 50% 50%, #000 30%, transparent 75%); }
  .road { position: absolute; background: rgba(148,163,184,.35); border-radius: 99px; }
  .pin { position: absolute; left: 864px; top: 132px; filter: drop-shadow(0 18px 24px rgba(0,0,0,.55)); }
  .shadow { position: absolute; left: 896px; top: 318px; width: 48px; height: 14px; border-radius: 50%; background: rgba(0,0,0,.55); }
  .coords { position: absolute; left: 700px; top: 372px; width: 440px; text-align: center; font: 600 34px/1 ui-monospace, Menlo, Consolas, monospace;
    color: #e2e8f0; letter-spacing: -.5px; }
  .copy { position: absolute; left: 72px; top: 92px; width: 560px; }
  .eyebrow { display: inline-flex; gap: 10px; align-items: center; font-size: 22px; font-weight: 600; color: #fda4af; }
  h1 { margin-top: 26px; font-size: 76px; line-height: 1.02; letter-spacing: -2.5px; font-weight: 800; }
  p { margin-top: 26px; font-size: 28px; line-height: 1.35; color: #cbd5e1; }
  .tags { position: absolute; left: 72px; bottom: 64px; display: flex; gap: 14px; }
  .tag { padding: 10px 18px; border-radius: 99px; border: 1px solid rgba(148,163,184,.35); font-size: 21px; color: #e2e8f0; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; }
</style></head><body>
  <div class="map"></div><div class="grid"></div>
  <div class="road" style="left:600px;top:250px;width:620px;height:10px;transform:rotate(-12deg)"></div>
  <div class="road" style="left:780px;top:40px;width:9px;height:560px;transform:rotate(18deg)"></div>
  <div class="road" style="left:640px;top:470px;width:560px;height:6px;transform:rotate(7deg)"></div>
  <div class="shadow"></div><div class="pin">${PIN}</div>
  <div class="coords">48.858370, 2.294481</div>
  <div class="copy">
    <div class="eyebrow"><code>&lt;location-picker&gt;</code></div>
    <h1>Pan the map.<br>Get the exact lat,lng.</h1>
    <p>A form-ready location field: a fixed pin, keyless OpenStreetMap, one script tag.</p>
  </div>
  <div class="tags"><span class="tag">Web component</span><span class="tag">No API key</span><span class="tag">MIT</span></div>
</body></html>`;

if (process.argv.includes('--og')) {
  await renderOgImage('site/og.png');
} else {
  await buildSite();
}
