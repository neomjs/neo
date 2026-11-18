import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    computeImportWaterfallDepth,
    formatMeasurementMarkdown,
    patchImportAppManifest,
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
        expect(md).toContain('| dist/esbuild-probe | h2 | 0 ms (clean) | cold | ERROR | - | - | - | - | - | ReferenceError: Neo is not defined (chunk.mjs:1) | failed |')
    });
});
