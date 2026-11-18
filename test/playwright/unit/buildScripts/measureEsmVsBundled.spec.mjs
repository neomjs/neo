import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    computeImportWaterfallDepth,
    formatMeasurementMarkdown,
    matchesStepInDom,
    patchImportAppManifest,
    runSingleLoadInContext,
    summarizeFiveRuns
} from '../../../../buildScripts/util/measure-esm-vs-bundled.mjs';

/**
 * @summary Unit tests for the pure graph-depth, 5-run protocol aggregation, and esbuild probe manifest helpers.
 */
test.describe('buildScripts/util/measure-esm-vs-bundled', () => {
    test('computeImportWaterfallDepth measures longest-shortest static hop chain on synthetic graph and live App worker', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-wf-depth-'));

        try {
            fs.writeFileSync(path.join(tmpDir, 'entry.mjs'), "import './a.mjs';\nimport './d.mjs';\n");
            fs.writeFileSync(path.join(tmpDir, 'a.mjs'), "import './b.mjs';\n");
            fs.writeFileSync(path.join(tmpDir, 'b.mjs'), "import './c.mjs';\n");
            fs.writeFileSync(path.join(tmpDir, 'c.mjs'), "import './d.mjs';\n");
            fs.writeFileSync(path.join(tmpDir, 'd.mjs'), 'export const leaf = 1;\n');

            const synthetic = computeImportWaterfallDepth(path.join(tmpDir, 'entry.mjs'), tmpDir);

            expect(synthetic.reachableCount).toBe(5);
            expect(synthetic.maxStaticDepth).toBe(3);
            expect(synthetic.deepestChain).toEqual(['entry.mjs', 'a.mjs', 'b.mjs', 'c.mjs']);

            const appWorkerPath = path.resolve('src/worker/App.mjs');
            const live          = computeImportWaterfallDepth(appWorkerPath, path.resolve('.'));

            expect(live.maxStaticDepth).toBeGreaterThanOrEqual(4);
            expect(live.reachableCount).toBeGreaterThan(20)
        } finally {
            fs.rmSync(tmpDir, {recursive: true, force: true})
        }
    });

    test('summarizeFiveRuns enforces nextHopProtocol purity and computes exact median and min-max spread', () => {
        const cleanH3 = [100, 120, 110, 140, 130].map(frameMs => ({
            frameMs,
            requests         : 167,
            transferBytes    : 204800,
            workerWaterfallMs: frameMs - 20,
            interactionMs    : 12,
            lazyExtensionMs  : 35,
            protocolCounts   : {h3: 167}
        }));

        const ok = summarizeFiveRuns(cleanH3, 'h3', true);

        expect(ok.verifiedProtocol).toBe(true);
        expect(ok.frameMs.median).toBe(120);
        expect(ok.frameMs.spread).toBe('100–140');
        expect(ok.requests.median).toBe(167);
        expect(ok.transferKB.median).toBe(200);

        const downgraded = [...cleanH3.slice(0, 4), {...cleanH3[4], protocolCounts: {h2: 10, h3: 157}}];
        const bad        = summarizeFiveRuns(downgraded, 'h3', true);

        expect(bad.verifiedProtocol).toBe(false);
        expect(bad.badProtocols).toEqual(['h2'])
    });

    test('patchImportAppManifest rewrites App worker dynamic importApp template literal cleanly', () => {
        const workerSrc = fs.readFileSync(path.resolve('src/worker/App.mjs'), 'utf8');
        const patched   = patchImportAppManifest(workerSrc, ['apps/portal/app.mjs']);

        expect(patched).toContain('import("../../apps/portal/app.mjs")');
        expect(patched).not.toContain('../../${path}.mjs');

        const minifiedPatched = patchImportAppManifest('export default{importApp(e){return import(`../../${e}.mjs`)}}', ['apps/portal/app.mjs']);

        expect(minifiedPatched).toContain('import("../../apps/portal/app.mjs")');
        expect(minifiedPatched).not.toContain('../../${e}.mjs')
    });

    test('formatMeasurementMarkdown emits worker boot failures and ERROR cells for esbuild probes', () => {
        const md = formatMeasurementMarkdown({
            meta: {
                commit : 'abc1234',
                machine: 'linux',
                browser: 'Chromium',
                server : 'caddy',
                command: 'node buildScripts/util/measure-esm-vs-bundled.mjs --runs 5',
                runs   : 5
            },
            waterfalls   : [],
            esbuildProbes: {
                portal: {
                    ok          : true,
                    entryCount  : 9,
                    chunkCount  : 86,
                    rawSrc      : {ok: false, reason: 'Raw fails'},
                    runtimeError: 'ReferenceError: Neo is not defined (chunk.mjs:1)'
                }
            },
            apps: [{
                title: 'Portal (`apps/portal`)',
                cells: [{
                    build   : 'dist/esbuild-probe',
                    protocol: 'h2',
                    link    : '0 ms (clean)',
                    cache   : 'cold',
                    error   : 'ReferenceError: Neo is not defined (chunk.mjs:1)'
                }]
            }]
        });

        expect(md).toContain('FAILED at worker boot — `ReferenceError: Neo is not defined (chunk.mjs:1)`');
        expect(md).toContain('| Build | Proto | Link | Cache | Frame ms (spread) | Res entries (med) | KB (med) | Worker waterfall ms | Interaction ms | Lazy ext ms | `nextHopProtocol` | Class/Singleton check |');
        expect(md).toContain('| dist/esbuild-probe | h2 | 0 ms (clean) | cold | ERROR | - | - | - | - | - | ReferenceError: Neo is not defined (chunk.mjs:1) | failed |')
    });

    test('matchesStepInDom enforces selector, optional text substring, and layout visibility', () => {
        const createDoc = items => ({
            defaultView: {
                getComputedStyle: el => el.style
            },
            querySelectorAll: selector => items[selector] || []
        });

        const hiddenEl = {
            textContent   : 'Connect',
            style         : {display: 'none', visibility: 'visible'},
            getClientRects: () => []
        };
        const visibleEl = {
            textContent   : 'Connect',
            style         : {display: 'block', visibility: 'visible'},
            getClientRects: () => [{width: 80, height: 24}]
        };

        expect(matchesStepInDom(createDoc({'.hero': [hiddenEl]}), {selector: '.hero', visible: true})).toBe(false);
        expect(matchesStepInDom(createDoc({'.hero': [visibleEl]}), {selector: '.hero', text: 'Missing', visible: true})).toBe(false);
        expect(matchesStepInDom(createDoc({'.hero': [visibleEl]}), {selector: '.hero', text: 'Connect', visible: true})).toBe(true);
        expect(matchesStepInDom(createDoc({body: [hiddenEl]}), {selector: 'body', text: 'Connect', visible: false})).toBe(true)
    });

    test('runSingleLoadInContext closes aborted pages and retries with a fresh page on in-page RAF stamps', async () => {
        const clicks       = [], waitArgs = [], pollModes = [];
        let   newPageCalls = 0, closedPages = 0, evalCount = 0;

        const context = {
            async newPage() {
                const attempt = ++newPageCalls;

                return {
                    async goto() {
                        if (attempt === 1) {
                            throw new Error('page.goto: net::ERR_ABORTED')
                        }
                    },
                    async waitForFunction(fn, arg, opts) {
                        waitArgs.push(arg.target);
                        pollModes.push(opts?.polling);

                        return {
                            async jsonValue() {
                                return {ms: 42.5}
                            },
                            async dispose() {}
                        }
                    },
                    async evaluate() {
                        evalCount++;
                        return evalCount === 2 || evalCount === 3 ? 100 : []
                    },
                    async click(selector) {
                        clicks.push(selector)
                    },
                    async close() {
                        closedPages++
                    }
                }
            }
        };

        const browserCdp = {
            async send() {
                return {targetInfos: []}
            }
        };

        const result = await runSingleLoadInContext({
            context,
            browserCdp,
            origin: 'https://neo-bench.internal:8444',
            url   : 'https://neo-bench.internal:8444/dist/esm/apps/myapp/index.html',
            kind  : 'starter'
        });

        expect(newPageCalls).toBe(2);
        expect(closedPages).toBe(2);
        expect(clicks).toEqual(['text=Tab 2', 'text=Tab 3']);
        expect(pollModes).toEqual(['raf', 'raf', 'raf']);
        expect(waitArgs.map(step => step.selector)).toEqual(['body', 'body', '.starter-lazy-panel']);
        expect(waitArgs.map(step => step.text)).toEqual([
            'Welcome to your new Neo.mjs App.',
            'Have fun creating something awesome!',
            'Lazy module loaded'
        ]);
        expect(result.frameMs).toBe(42.5);
        expect(result.interactionMs).toBe(42.5);
        expect(result.lazyExtensionMs).toBe(42.5);
        expect(result.requests).toBe(0);
        expect(result.runtimeCheck).toBe('uninspected')
    });
});
