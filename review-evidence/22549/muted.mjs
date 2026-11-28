// #22549 AC-1/AC-2: the muted id and date text of examples/grid/issues in Neo Dark, its painted backdrop and contrast at
// rest and on a hovered row, released (neomjs.com) / dev / head, plus a frame per side. Usage: node muted.mjs <dev tree> <head tree>
import http       from 'node:http';
import path       from 'node:path';
import {once}     from 'node:events';
import {chromium} from '/Users/tobiasuhlig/.neo-ai/agents/neo-opus-ada/neomjs/neo/node_modules/playwright/index.mjs';

const out = path.dirname(new URL(import.meta.url).pathname),
      UA  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

async function serve(root) {
    const {createFileServer} = await import(path.join(root, 'buildScripts/util/fileServer.mjs')),
          files              = createFileServer({root, spaRoot: false, freshness: {onRequest() {}, onListening() {}}}),
          server             = http.createServer((req, res) => files.emit('request', req, res));

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return {server, origin: `http://127.0.0.1:${server.address().port}`}
}

// Reads every muted text in the grid and its first opaque backdrop, with the WCAG ratio
const measure = () => {
    const rgb  = text => text.match(/[\d.]+/g).slice(0, 3).map(Number),
          lum  = c => c.map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0),
          ratio = (a, b) => {const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2)},
          rows = [];

    for (const el of document.querySelectorAll('.neo-grid-row .neo-grid-cell')) {
        const text = [...el.querySelectorAll('*'), el].find(n => n.textContent.trim() && getComputedStyle(n).color === getComputedStyle(document.querySelector('.neo-examples-grid-issues')).getPropertyValue('--examples-grid-issues-muted-color').trim().replace(/^#(..)(..)(..)$/, (m, r, g, b) => `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`));
        if (!text) continue;
        let bg = null;
        for (let n = text; n; n = n.parentElement) {const v = getComputedStyle(n).backgroundColor; if (v !== 'rgba(0, 0, 0, 0)') {bg = v; break}}
        rows.push(ratio(rgb(getComputedStyle(text).color), rgb(bg)))
    }

    return {muted: getComputedStyle(document.querySelector('.neo-examples-grid-issues')).getPropertyValue('--examples-grid-issues-muted-color').trim(), cells: rows.length, min: Math.min(...rows)}
};

const [devTree, headTree] = process.argv.slice(2),
      dev     = await serve(devTree),
      head    = await serve(headTree),
      browser = await chromium.launch();

try {
    for (const [side, url] of [['released', 'https://neomjs.com/examples/grid/issues/?theme=neo-theme-neo-dark'], ['dev', `${dev.origin}/examples/grid/issues/index.html?theme=neo-theme-neo-dark`], ['head', `${head.origin}/examples/grid/issues/index.html?theme=neo-theme-neo-dark`]]) {
        const context = await browser.newContext({viewport: {width: 1280, height: 800}, colorScheme: 'dark', ...(side === 'released' && {userAgent: UA})}),
              page    = await context.newPage();

        await page.goto(url, {waitUntil: 'load', timeout: 60000});
        await page.waitForSelector('.neo-grid-row', {timeout: 45000});
        await page.waitForTimeout(2500);

        const rest = await page.evaluate(measure);

        await page.screenshot({path: path.join(out, `grid-issues-dark-${side}.png`)});
        await page.locator('.neo-grid-row').nth(1).hover();
        await page.waitForTimeout(400);

        const hover = await page.evaluate(measure);

        console.log(side.padEnd(8), JSON.stringify({muted: rest.muted, cells: rest.cells, restMin: rest.min, hoverMin: hover.min}));
        await context.close()
    }
} finally {
    await browser.close();
    dev.server.close();
    head.server.close()
}
