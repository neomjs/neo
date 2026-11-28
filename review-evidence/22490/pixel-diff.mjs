// #22490 triage aid: per surface x scheme, the share of pixels that differ visibly between the released and the dev
// frame of a release-compare run, so a computed-style row nobody can see is told apart from one that paints.
// Usage: node pixel-diff.mjs <neo-clone> <run-dir>  → writes <run-dir>/pixel-diff.json and prints a table
import fs              from 'node:fs';
import path            from 'node:path';
import {createRequire} from 'node:module';

const [clone, runDir] = process.argv.slice(2),
      require         = createRequire(path.join(clone, 'package.json')),
      {chromium}      = require('playwright'),
      frames          = path.join(runDir, 'frames'),
      report          = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8')),
      browser         = await chromium.launch({headless: true}),
      page            = await browser.newPage(),
      out             = [];

const slug = (surface, scheme) => `${surface.replace(/\//g, '-')}-${scheme.replace('neo-theme-neo-', '')}`;

for (const run of report.runs) {
    const base = slug(run.surface, run.scheme),
          rel  = path.join(frames, `${base}-released.png`),
          dev  = path.join(frames, `${base}-dev.png`);

    if (!fs.existsSync(rel) || !fs.existsSync(dev)) {
        out.push({surface: run.surface, scheme: run.scheme, rows: run.rows?.length ?? null, missing: true});
        continue
    }

    const toUrl = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

    const result = await page.evaluate(async ([a, b]) => {
        const load = src => new Promise((ok, fail) => {const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src});
        const [ia, ib] = await Promise.all([load(a), load(b)]),
              w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height),
              read = img => {const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data},
              da = read(ia), db = read(ib);
        let changed = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let i = 0; i < da.length; i += 4) {
            if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > 24) {
                const p = i / 4, x = p % w, y = (p - x) / w;
                changed++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
            }
        }
        return {share: +(100 * changed / (w * h)).toFixed(2), box: changed ? [x0, y0, x1, y1] : null}
    }, [toUrl(rel), toUrl(dev)]);

    out.push({surface: run.surface, scheme: run.scheme, rows: run.rows?.length ?? null, ...result})
}

await browser.close();
fs.writeFileSync(path.join(runDir, 'pixel-diff.json'), JSON.stringify(out, null, 1));

for (const r of out.sort((p, q) => (q.share ?? -1) - (p.share ?? -1))) {
    console.log(String(r.share ?? '-').padStart(6), String(r.rows ?? '-').padStart(4), r.surface, r.scheme.replace('neo-theme-neo-', ''), r.box ? JSON.stringify(r.box) : (r.missing ? 'no frames' : ''))
}
