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

/**
 * The delivery paths, which is where the reporting silences lived. Every collaborator is injected,
 * so each arm asserts a decision the runner made rather than a service's availability.
 */
test.describe('nightlyE2eRunner.runNightlyE2e — delivery disposition and wake tier (#17691)', () => {
    let runNightlyE2e, cwd, tmpDir;

    const
        stateFile  = () => path.join(tmpDir, '.neo-ai-data/nightly-e2e/last-run.json'),
        readState  = async () => fs.readJson(stateFile()),
        redOutcome = entry => ({
            config  : entry.config,
            failures: [{title: 'a failing spec', file: 'x.spec.mjs', error: 'boom'}],
            note    : '',
            output  : '',
            ran     : true
        }),
        greenOutcome = entry => ({config: entry.config, failures: [], note: '', output: '', ran: true});

    test.beforeAll(async () => {
        runNightlyE2e = (await import('../../../../../../ai/scripts/lifecycle/nightlyE2eRunner.mjs')).runNightlyE2e;
    });

    test.beforeEach(async () => {
        cwd    = process.cwd();
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nightly-e2e-delivery-'));
        process.chdir(tmpDir)
    });

    test.afterEach(async () => {
        process.chdir(cwd);
        await fs.remove(tmpDir)
    });

    test('a RED digest opts OUT of wake suppression — a red suite is action-required, not drain-class', async () => {
        // `AGENT:*` defaults to suppressed, so inheriting that default would land a red suite
        // silently in mailboxes carrying thousands unread.
        const sent = [];

        const result = await runNightlyE2e({
            addMessage    : async options => { sent.push(options) },
            graphReady    : async () => {},
            lifecycleReady: async () => {},
            runOne        : redOutcome
        });

        expect(result).toMatchObject({red: true, sent: true});
        expect(sent).toHaveLength(1);
        expect(sent[0].wakeSuppressed).toBe(false);
        expect(sent[0].to).toBe('AGENT:*');
        expect(sent[0].subject).toContain('[nightly-e2e][RED]')
    });

    test('a GREEN run sends nothing and wakes nobody', async () => {
        const sent = [];

        const result = await runNightlyE2e({
            addMessage    : async options => { sent.push(options) },
            graphReady    : async () => {},
            lifecycleReady: async () => {},
            runOne        : greenOutcome
        });

        expect(result).toMatchObject({red: false, sent: false});
        expect(sent).toEqual([]);
        expect(await readState()).toMatchObject({red: false, digest: 'not-required'})
    });

    test('delivery is RECORDED, not derived: a successful send writes `sent`', async () => {
        await runNightlyE2e({
            addMessage    : async () => {},
            graphReady    : async () => {},
            lifecycleReady: async () => {},
            runOne        : redOutcome
        });

        expect(await readState()).toMatchObject({red: true, digest: 'sent'})
    });

    test('a THROWING send records `failed` durably and rethrows — the red is not lost', async () => {
        await expect(runNightlyE2e({
            addMessage    : async () => { throw new Error('mailbox unreachable') },
            graphReady    : async () => {},
            lifecycleReady: async () => {},
            runOne        : redOutcome
        })).rejects.toThrow('mailbox unreachable');

        expect(await readState()).toMatchObject({
            red        : true,
            digest     : 'failed',
            digestError: 'mailbox unreachable'
        })
    });

    test('a crash BEFORE the send leaves `pending` standing, never `sent`', async () => {
        // The state that used to be indistinguishable from success: the receipt is written before
        // the attempt, so an undelivered digest cannot be re-derived as delivered.
        await expect(runNightlyE2e({
            addMessage    : async () => {},
            graphReady    : async () => {},
            lifecycleReady: async () => { throw new Error('graph never became ready') },
            runOne        : redOutcome
        })).rejects.toThrow('graph never became ready');

        expect(await readState()).toMatchObject({red: true, digest: 'failed'});
    });

    test('the lock is released on the failure path too', async () => {
        await expect(runNightlyE2e({
            addMessage    : async () => { throw new Error('nope') },
            graphReady    : async () => {},
            lifecycleReady: async () => {},
            runOne        : redOutcome
        })).rejects.toThrow('nope');

        expect(await fs.pathExists(path.join(tmpDir, '.neo-ai-data/nightly-e2e/runner.lock'))).toBe(false)
    })
});
