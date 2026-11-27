import {setup}                                     from '../../setup.mjs';

setup({
    appConfig: {
        name: 'UnitRunPolicyTest'
    }
});

import {test, expect}                   from '@playwright/test';
import {execFileSync}                   from 'node:child_process';
import path                             from 'node:path';
import {fileURLToPath}                  from 'node:url';
import Neo                              from '../../../../src/Neo.mjs';
import * as core                        from '../../../../src/core/_export.mjs';
import unitConfig, {buildUnitRunPolicy} from '../../playwright.config.unit.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * The unit run policy is read by three readers in CI — a reviewer (the `github` annotations), the defect
 * ledger's producer (the `list` reporter's one line per test, whose `✓` marks are the only per-test pass
 * evidence a green run leaves in its log) and the failure artifact (the `json` report) — and by one
 * locally. `fullyParallel: false` keeps worker parallelism at the `.spec.mjs` file boundary so each file's
 * tests run contiguously after its module-level `setup()`, while `setup.mjs` locks `Neo.config` object
 * identity so engine singletons (`VdomHelper`, `DeltaUpdates`, `worker.Manager`) never detach.
 */
test.describe('unit run policy and Neo.config reference isolation', () => {
    test('in CI the github annotations, the per-test list and the json report compose with file-level parallelism', () => {
        const {reporter, failOnFlakyTests, forbidOnly, fullyParallel, retries, workers} = buildUnitRunPolicy({isCI: true});

        expect(reporter.map(entry => entry[0])).toEqual(['github', 'list', 'json']);
        expect(reporter[2][1].outputFile.endsWith('test-results/unit/test-results.json')).toBe(true);
        expect({failOnFlakyTests, forbidOnly, fullyParallel, retries, workers}).toEqual({
            failOnFlakyTests: true,
            forbidOnly      : true,
            fullyParallel   : false,
            retries         : 2,
            workers         : 4
        });
    });

    test('locally only the json report is configured and file-level parallelism holds across both unit configs', () => {
        const {reporter, failOnFlakyTests, forbidOnly, fullyParallel, retries, workers} = buildUnitRunPolicy({isCI: false});

        expect(reporter.map(entry => entry[0])).toEqual(['json']);
        expect({failOnFlakyTests, forbidOnly, fullyParallel, retries, workers}).toEqual({
            failOnFlakyTests: false,
            forbidOnly      : false,
            fullyParallel   : false,
            retries         : 0,
            workers         : undefined
        });
        expect(unitConfig.fullyParallel).toBe(false);

        // Evaluate `playwright.config.unit-tz.mjs` in a child process so its top-level `process.env.TZ`
        // assignment never mutates the UTC unit worker's timezone.
        const tzOut = execFileSync(
            process.execPath,
            ['--input-type=module', '-e', "import cfg from './test/playwright/playwright.config.unit-tz.mjs'; console.log(JSON.stringify({fullyParallel: cfg.fullyParallel}))"],
            {cwd: repoRoot, encoding: 'utf8'}
        );

        expect(JSON.parse(tzOut.trim())).toEqual({fullyParallel: false});
    });

    test('setup.mjs preserves Neo.config object identity across setup() calls and rejects foreign object replacement', () => {
        const canonicalRef = Neo.config;

        // `src/DefaultConfig.mjs` executes `Neo.config = Neo.config || {}` at bootstrap; self-assignment must stay a no-op
        Neo.config = Neo.config;
        expect(Neo.config).toBe(canonicalRef);

        expect(() => {
            Neo.config = {...Neo.config, useDomApiRenderer: false};
        }).toThrow(TypeError);
        expect(Neo.config).toBe(canonicalRef);

        setup({neoConfig: {useDomApiRenderer: false}});
        expect(Neo.config).toBe(canonicalRef);
        expect(Neo.config.useDomApiRenderer).toBe(false);

        setup({});
        expect(Neo.config).toBe(canonicalRef);
    });
});
