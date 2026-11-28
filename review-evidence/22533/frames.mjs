// #22533 AC-3 and AC-4: the timeline header against the locked column headers, and frames of the scheduler and
// Gantt examples, released (neomjs.com) / dev / head, both schemes. Usage: node frames.mjs <dev tree> <head tree>
import http           from 'node:http';
import path           from 'node:path';
import {once}         from 'node:events';
import {chromium}     from '/Users/tobiasuhlig/.neo-ai/agents/neo-opus-ada/neomjs/neo/node_modules/playwright/index.mjs';

const out    = path.dirname(new URL(import.meta.url).pathname),
      UA     = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      pages  = ['scheduler/basic', 'gantt/basic'],
      themes = ['neo-theme-neo-light', 'neo-theme-neo-dark'];

async function serve(root) {
    const {createFileServer} = await import(path.join(root, 'buildScripts/util/fileServer.mjs')),
          files              = createFileServer({root, spaRoot: false, freshness: {onRequest() {}, onListening() {}}}),
          server             = http.createServer((req, res) => files.emit('request', req, res));

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return {server, origin: `http://127.0.0.1:${server.address().port}`}
}

const [devTree, headTree] = process.argv.slice(2),
      dev     = await serve(devTree),
      head    = await serve(headTree),
      browser = await chromium.launch(),
      report  = [];

try {
    for (const page of pages) {
        for (const theme of themes) {
            for (const [side, base] of [['released', 'https://neomjs.com'], ['dev', dev.origin], ['head', head.origin]]) {
                const context = await browser.newContext({
                          viewport   : {width: 1280, height: 800},
                          colorScheme: theme.endsWith('dark') ? 'dark' : 'light',
                          ...(side === 'released' && {userAgent: UA})
                      }),
                      tab     = await context.newPage(),
                      url     = side === 'released' ? `${base}/examples/${page}/?theme=${theme}` : `${base}/examples/${page}/index.html?theme=${theme}`;

                try {
                    await tab.goto(url, {waitUntil: 'load', timeout: 60000});
                    await tab.waitForSelector('.neo-timeline-header', {timeout: 45000});
                    await tab.waitForTimeout(2500);

                    const read = await tab.evaluate(() => {
                        const bg     = el => el && getComputedStyle(el).backgroundColor,
                              header = document.querySelector('.neo-timeline-header'),
                              locked = document.querySelector('.neo-grid-header-toolbar .neo-grid-header-button:not(.neo-timeline-header)'),
                              themed = [...document.querySelectorAll('[class*="neo-theme-"]')]
                                  .flatMap(el => [...el.classList]).find(name => /^neo-theme-(?!switcher|scope)/.test(name));

                        return {header: bg(header), locked: bg(locked), observed: themed}
                    });

                    const file = `${page.replace('/', '-')}-${theme.replace('neo-theme-', '')}-${side}.png`;

                    await tab.screenshot({path: path.join(out, file)});
                    report.push({page, theme, side, ...read, same: read.header === read.locked, file})
                } catch (error) {
                    report.push({page, theme, side, error: error.message.split('\n')[0]})
                } finally {
                    await context.close()
                }
            }
        }
    }
} finally {
    await browser.close();
    dev.server.close();
    head.server.close()
}

for (const row of report) console.log(JSON.stringify(row))
