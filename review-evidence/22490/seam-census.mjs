// #22490: census of fills that differ from the bar they sit in. For every theme-Neo surface in one scheme, find
// opaque boxes (not buttons, fields or nested bars) inside a toolbar whose background differs from that toolbar's,
// on the released site and on a dev export. A box that matched its bar in 14.0 and stands out on dev is a seam.
// Usage: node seam-census.mjs <neo-clone> <run-dir> <dev-base-url> [scheme=neo-theme-neo-dark]
import fs              from 'node:fs';
import path            from 'node:path';
import {createRequire} from 'node:module';

const [clone, runDir, devBase, scheme = 'neo-theme-neo-dark'] = process.argv.slice(2),
      require    = createRequire(path.join(clone, 'package.json')),
      {chromium} = require('playwright'),
      UA         = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      surfaces   = [...new Set(JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8')).runs.map(r => r.surface))],
      browser    = await chromium.launch({headless: true}),
      result     = {};

async function census(base, surface) {
    const ctx  = await browser.newContext({viewport: {width: 1280, height: 800}, userAgent: UA}),
          page = await ctx.newPage();
    try {
        await page.goto(`${base}/${surface}/index.html?theme=${scheme}`);
        await page.waitForFunction(() => window.Neo && document.querySelector('.neo-viewport, .neo-container'), null, {timeout: 30000});
        await new Promise(r => setTimeout(r, 1500));
        return await page.evaluate(() => {
            const out = [], skip = '.neo-button, .neo-field, input, textarea, select, .neo-toolbar, svg, canvas, img';
            for (const bar of document.querySelectorAll('.neo-toolbar')) {
                const barBg = getComputedStyle(bar).backgroundColor;
                for (const el of bar.querySelectorAll('*')) {
                    if (el.parentElement.closest('.neo-toolbar') !== bar || el.matches(skip) || el.closest('.neo-button, .neo-field')) continue;
                    const bg = getComputedStyle(el).backgroundColor, r = el.getBoundingClientRect();
                    if (/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(bg) || bg === barBg || r.width < 8 || r.height < 8) continue;
                    out.push(`${String(el.className).split(' ').filter(c => !/^neo-(flex|layout|hbox|vbox)/.test(c)).slice(0, 3).join('.')} ${Math.round(r.width)}x${Math.round(r.height)} ${bg} on ${barBg}`)
                }
            }
            return out
        })
    } catch (e) {
        return [`ERROR ${String(e.message).slice(0, 80)}`]
    } finally {
        await ctx.close()
    }
}

for (const surface of surfaces) {
    const dev = await census(devBase, surface);
    if (!dev.length) continue;
    const released = await census('https://neomjs.com', surface);
    result[surface] = {dev, released};
    console.log(`## ${surface}\n  dev:      ${dev.join('\n            ')}\n  released: ${released.join('\n            ') || '(none)'}`)
}

fs.writeFileSync(path.join(runDir, `seam-census-${scheme.replace('neo-theme-neo-', '')}.json`), JSON.stringify(result, null, 1));
await browser.close();
