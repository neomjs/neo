import {setup} from '../../../../setup.mjs';

const appName = 'NightlyE2eRunnerTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'node:os';
import path           from 'node:path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

// runConfig imports the memory-core services at module load, so pull it in AFTER Neo is initialized.
test.describe('nightlyE2eRunner.runConfig — stale-report suppression guard (#14685)', () => {
    let runConfig, tmpDir;

    test.beforeAll(async () => {
        runConfig = (await import('../../../../../../ai/scripts/lifecycle/nightlyE2eRunner.mjs')).runConfig;
    });

    test.beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `neo-nightly-runner-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        fs.ensureDirSync(tmpDir);
    });

    test.afterEach(() => {
        fs.removeSync(tmpDir);
    });

    test('a stale green results.json cannot suppress a red — it is cleared before the run, so a no-report run scores infra-red', () => {
        const results = path.join(tmpDir, 'results.json');

        // A leftover GREEN report from a PRIOR run sits on disk.
        fs.writeJsonSync(results, {suites: [{title: 'root', file: 'x.spec.mjs', specs: [{title: 'ok', line: 1, ok: true, tests: [{results: [{status: 'passed'}]}]}]}]});

        // THIS run fails to boot and writes NO fresh report (non-zero exit, no results.json write).
        const fakeSpawn = () => ({status: 1, stdout: '', stderr: 'boot failed'});

        const outcome = runConfig({config: 'e2e.config.mjs', results}, {spawn: fakeSpawn});

        // The stale green must NOT be read as this run's result — it surfaces as an infra red, never green.
        expect(outcome.ran).toBe(false);
        expect(outcome.note).toContain('infra/boot failure');
        expect(outcome.failures).toEqual([]);
        expect(fs.pathExistsSync(results)).toBe(false);   // stale cleared; this run wrote none
    });

    test('a FRESH report written by the run is still read (the clear only removes STALE output)', () => {
        const results = path.join(tmpDir, 'results.json');

        // The run writes a fresh FAILING report as it executes (runConfig clears stale first, then spawns).
        const fakeSpawn = () => {
            fs.writeJsonSync(results, {suites: [{title: 'root', file: 'x.spec.mjs', specs: [{title: 'boom', file: 'x.spec.mjs', line: 3, ok: false, tests: [{results: [{status: 'failed', errors: [{message: 'Error: boom\n  at x.spec.mjs:3:1'}]}]}]}]}]});
            return {status: 1, stdout: '', stderr: ''};
        };

        const outcome = runConfig({config: 'e2e.config.mjs', results}, {spawn: fakeSpawn});

        expect(outcome.ran).toBe(true);
        expect(outcome.failures.length).toBe(1);
        expect(outcome.failures[0].title).toBe('boom');
    });
});
