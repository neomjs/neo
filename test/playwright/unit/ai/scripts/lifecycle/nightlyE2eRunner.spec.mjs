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
    let collectFailures, runNightlyE2e, cwd, tmpDir;

    const
        stateFile  = () => path.join(tmpDir, '.neo-ai-data/nightly-e2e/last-run.json'),
        readState  = async () => fs.readJson(stateFile()),
        // One seam replaces the former addMessage/graphReady/lifecycleReady trio: the runner reaches
        // Memory Core as an MCP client, so "could not connect" and "the call was rejected"
        // are distinct failures without separate readiness hooks. The stub carries `callTool` rather
        // than a bare send, so the arms assert the real tool NAME and not just its payload.
        connectStub = (onCall = () => {}) => async () => ({
            callTool: async (name, args) => onCall(name, args),
            close   : async () => {}
        }),
        // The failure shape is DERIVED from production's own `collectFailures`, never hand-written.
        // A hand-written fixture drifted: it carried `{file, error}` while `formatDigest` reads
        // `{location, firstError}`, so every digest-content assertion was checking a shape production
        // cannot emit — and the digest rendered `undefined`. That was invisible until nine real
        // digests reached the swarm and showed the rendered text. Derivation makes the drift
        // impossible rather than caught. Found by @neo-opus-vega.
        productionFailures = () => collectFailures({
            suites: [{
                title: 'root',
                file : 'x.spec.mjs',
                specs: [{
                    title: 'a failing spec',
                    file : 'x.spec.mjs',
                    line : 3,
                    ok   : false,
                    tests: [{results: [{status: 'failed', errors: [{message: 'Error: boom\n  at x.spec.mjs:3:1'}]}]}]
                }]
            }]
        }),
        redOutcome = entry => ({
            config  : entry.config,
            failures: productionFailures(),
            note    : '',
            output  : '',
            ran     : true
        }),
        greenOutcome = entry => ({config: entry.config, failures: [], note: '', output: '', ran: true});

    test.beforeAll(async () => {
        runNightlyE2e = (await import('../../../../../../ai/scripts/lifecycle/nightlyE2eRunner.mjs')).runNightlyE2e;
        ({collectFailures} = await import('../../../../../../ai/scripts/lifecycle/nightlyE2eDigest.mjs'));
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
            connect: connectStub((name, args) => { sent.push({name, ...args}) }),
            runOne : redOutcome
        });

        expect(result).toMatchObject({red: true, sent: true});
        expect(sent).toHaveLength(1);
        // The tool NAME is part of the contract now, not just the payload: the digest travels as an
        // `add_message` call against Memory Core, and a rename on either side must fail here.
        expect(sent[0].name).toBe('add_message');
        expect(sent[0].wakeSuppressed).toBe(false);
        expect(sent[0].to).toBe('AGENT:*');
        expect(sent[0].subject).toContain('[nightly-e2e][RED]')
    });

    test('a GREEN run sends nothing and wakes nobody', async () => {
        const sent = [];

        const result = await runNightlyE2e({
            connect: connectStub((name, args) => { sent.push({name, ...args}) }),
            runOne : greenOutcome
        });

        expect(result).toMatchObject({red: false, sent: false});
        expect(sent).toEqual([]);
        expect(await readState()).toMatchObject({red: false, digest: 'not-required'})
    });

    test('delivery is RECORDED, not derived: a successful send writes `sent`', async () => {
        await runNightlyE2e({
            connect: connectStub(),
            runOne : redOutcome
        });

        expect(await readState()).toMatchObject({red: true, digest: 'sent'})
    });

    test('a THROWING send records `failed` durably and rethrows — the red is not lost', async () => {
        await expect(runNightlyE2e({
            connect: connectStub(() => { throw new Error('mailbox unreachable') }),
            runOne : redOutcome
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
            // Now a CONNECT failure rather than a readiness failure — the transport is the thing that
            // can be unreachable, and it fails before any message is attempted.
            connect: async () => { throw new Error('graph never became ready') },
            runOne : redOutcome
        })).rejects.toThrow('graph never became ready');

        expect(await readState()).toMatchObject({red: true, digest: 'failed'});
    });

    test('the lock is released on the failure path too', async () => {
        await expect(runNightlyE2e({
            connect: connectStub(() => { throw new Error('nope') }),
            runOne : redOutcome
        })).rejects.toThrow('nope');

        expect(await fs.pathExists(path.join(tmpDir, '.neo-ai-data/nightly-e2e/runner.lock'))).toBe(false)
    });

    // ── across-run preservation ──────────────────────────────────────────────────────────────────
    // Every arm above proves a single invocation records its own disposition honestly. None of them
    // can fail when the NEXT run overwrites the receipt, because none of them runs twice — which is
    // exactly how an undelivered red survived review while every per-run assertion stayed green.

    test('a GREEN run cannot erase an unsent red — the undelivered digest is carried forward', async () => {
        await expect(runNightlyE2e({
            connect: connectStub(() => { throw new Error('mailbox unreachable') }),
            runOne : redOutcome
        })).rejects.toThrow('mailbox unreachable');

        const afterRed = await readState();

        expect(afterRed).toMatchObject({red: true, digest: 'failed'});

        // The night after: suite recovers, nothing to report. Before the carry existed this write
        // replaced the document above and the unreported red left no trace on any surface.
        const result = await runNightlyE2e({
            connect: connectStub(),
            runOne : greenOutcome
        });

        expect(result).toMatchObject({red: false, sent: false});

        const afterGreen = await readState();

        expect(afterGreen).toMatchObject({red: false, digest: 'not-required'});
        expect(afterGreen.unresolvedRed).toMatchObject({digest: 'failed', at: afterRed.at});
    });

    test('a green run after a DELIVERED red carries nothing — the carry is conditional, not decorative', async () => {
        await runNightlyE2e({
            connect: connectStub(),
            runOne : redOutcome
        });

        expect(await readState()).toMatchObject({red: true, digest: 'sent'});

        await runNightlyE2e({
            connect: connectStub(),
            runOne : greenOutcome
        });

        // A field that is always populated stops being read. This is the control that keeps the arm
        // above honest: it fails if the carry is written unconditionally.
        expect(await readState()).not.toHaveProperty('unresolvedRed');
    });

    test('the EARLIEST unreported red survives a chain of later runs', async () => {
        await expect(runNightlyE2e({
            connect: connectStub(() => { throw new Error('first miss') }),
            runOne : redOutcome
        })).rejects.toThrow('first miss');

        const firstAt = (await readState()).at;

        for (const note of ['second night', 'third night']) {
            await runNightlyE2e({
                connect: connectStub(),
                runOne : greenOutcome
            });
            expect(await readState(), note).toBeTruthy()
        }

        // Not the most recent miss — the FIRST one. A chain that re-stamps the carry each night would
        // report the latest green's predecessor and quietly lose the run that actually went unreported.
        expect((await readState()).unresolvedRed).toMatchObject({digest: 'failed', at: firstAt});
    });

    test('a DELIVERED digest clears the carry — reporting the suite discharges the earlier miss', async () => {
        await expect(runNightlyE2e({
            connect: connectStub(() => { throw new Error('missed') }),
            runOne : redOutcome
        })).rejects.toThrow('missed');

        await runNightlyE2e({
            connect: connectStub(),
            runOne : redOutcome
        });

        const state = await readState();

        expect(state).toMatchObject({red: true, digest: 'sent'});
        expect(state).not.toHaveProperty('unresolvedRed');
    });

    test('a RESOLVED tool refusal is a failed delivery, not a sent one', async () => {
        // MCP has two success boundaries and only the first throws: the request resolving means the
        // server ANSWERED, not that it accepted. Our own servers refuse by resolving `{isError:true}`
        // (`ai/mcp/server/BaseServer.mjs`), so a runner that writes `sent` on a resolved call records
        // a refused digest as delivered — this leaf's original defect, one layer up.
        let closed = false;

        await expect(runNightlyE2e({
            connect: async () => ({
                callTool: async () => ({isError: true, content: [{type: 'text', text: 'mailbox quota exceeded'}]}),
                close   : async () => { closed = true }
            }),
            runOne : redOutcome
        })).rejects.toThrow(/mailbox quota exceeded/);

        expect(await readState()).toMatchObject({red: true, digest: 'failed'});
        expect(closed).toBe(true);
        expect(await fs.pathExists(path.join(tmpDir, '.neo-ai-data/nightly-e2e/runner.lock'))).toBe(false)
    });

    test('a refused delivery is retained across the next green run, like any other unsent red', async () => {
        await expect(runNightlyE2e({
            connect: async () => ({
                callTool: async () => ({isError: true, content: [{type: 'text', text: 'refused'}]}),
                close   : async () => {}
            }),
            runOne : redOutcome
        })).rejects.toThrow(/refused/);

        const refusedAt = (await readState()).at;

        await runNightlyE2e({connect: connectStub(), runOne : greenOutcome});

        // A refusal is an undelivered red like any other, so the carry must not treat it differently
        // from a thrown one just because it arrived as a resolved value.
        expect((await readState()).unresolvedRed).toMatchObject({digest: 'failed', at: refusedAt})
    });

    test('a connect that never settles fails the run instead of hanging it', async () => {
        // `ready()` has no rejection path — `Neo.create` runs `initAsync` detached and `#readyPromise`
        // is resolve-only — so an unreachable ingress leaves it pending forever. Without a deadline
        // the unattended run hangs to the 6h stale-lock steal, which is the silence being replaced.
        await expect(runNightlyE2e({
            connect          : () => new Promise(() => {}),   // never settles, exactly like the real failure
            connectDeadlineMs: 50,
            runOne           : redOutcome
        })).rejects.toThrow(/did not settle within 50ms/);

        expect(await readState()).toMatchObject({red: true, digest: 'failed'});
        expect(await fs.pathExists(path.join(tmpDir, '.neo-ai-data/nightly-e2e/runner.lock'))).toBe(false)
    });

    // A production-shaped arm for a REJECTED (not missing) credential lived here and was removed on
    // purpose. Its evidence is real and is in the PR body as a reproducible command: against the live
    // ingress the runner catches the 401, writes `digest: 'failed'` with the server's text, releases
    // the lock, and exits non-zero. It cannot live in THIS suite, because a playwright worker outlives
    // the run: the client whose readiness never completed is never returned and never closed, and its
    // transport rejects again after the run finished. The arm therefore failed on the worker's
    // lifetime rather than on the runner's behaviour — red for the wrong reason, which is exactly what
    // an arm must never be. The abandoned-transport leak is real and separately owned.

    test('#17725 the suite CANNOT open a live Memory Core connection, stub or no stub', async () => {
        // The guard that makes every other arm's isolation structural instead of remembered. An arm
        // that omits the `connect` stub on a host with a credential used to reach the live fleet and
        // broadcast a wake-bearing digest to every seat. The credential is injected here so the arm
        // asserts the guard rather than the machine it happens to run on.
        expect(process.env.UNIT_TEST_MODE).toBe('true');

        await expect(runNightlyE2e({
            env   : {NEO_MCP_REMOTE_TOKEN: 'a-valid-looking-credential'},
            runOne: redOutcome
        })).rejects.toThrow(/UNIT_TEST_MODE/);

        // A refused connection is a recorded failure, not a silent success.
        expect(await readState()).toMatchObject({red: true, digest: 'failed'})
    });

    test('#17708 a MISSING credential fails loudly on the default transport, never silently', async () => {
        // The credential source is INJECTED, not deleted from the real environment. The previous shape
        // mutated `process.env` and was therefore green only while the ambient environment agreed with
        // it: on a host carrying a live credential the arm's premise was false, the real transport was
        // reached, and the failure mode was a write to production rather than a red test. Caught by
        // @neo-opus-vega after his full-suite run put nine wake-bearing digests into every mailbox.
        //
        // No `connect` injection: this drives the real `connectMemoryCore` against an empty env.
        await expect(runNightlyE2e({env: {}, runOne: redOutcome})).rejects.toThrow(/NEO_MCP_REMOTE_TOKEN/);

        // The red is not lost to the misconfiguration: it stands as an explicitly failed delivery.
        expect(await readState()).toMatchObject({red: true, digest: 'failed'})
    });

    test('an UNREADABLE prior receipt fails closed — a broken chain is not a clean one', async () => {
        await fs.ensureDir(path.dirname(stateFile()));
        await fs.writeFile(stateFile(), '{ this is not json', 'utf8');

        await runNightlyE2e({
            connect: connectStub(),
            runOne : greenOutcome
        });

        // Absent and unparseable are different facts. Collapsing them to `null` would let a corrupt
        // receipt read as a clean first run — the reader would inherit a green it never earned.
        expect((await readState()).unresolvedRed).toMatchObject({digest: 'unknown', reason: 'prior receipt unreadable'});
    });
});
