import {test, expect} from '@playwright/test';
import {spawn}        from 'node:child_process';

import {
    isProcessTerminated,
    REAP_OUTCOME,
    terminateDaemon
} from '../../integration/helpers/terminateDaemon.mjs';

// Short enough that the failure paths cost milliseconds. The production defaults are 5s/5s, which is
// why these are injected rather than waited out.
const FAST = {sigtermGraceMs: 60, sigkillReapMs: 1500};

/** A child that refuses SIGTERM — a daemon still finishing its shutdown. */
const spawnStubborn = () => launch('process.on("SIGTERM", () => {}); setInterval(() => {}, 50); console.log("ready")');

/** A child that exits cleanly on SIGTERM. */
const spawnCompliant = () => launch('setInterval(() => {}, 50); console.log("ready")');

/**
 * Spawns a node child and resolves once it has announced itself, so no spec races startup.
 * @param {String} source
 * @returns {Promise<import('node:child_process').ChildProcess>}
 */
function launch(source) {
    const child = spawn(process.execPath, ['-e', source], {stdio: ['ignore', 'pipe', 'ignore']});

    return new Promise(resolve => child.stdout.once('data', () => resolve(child)))
}

/**
 * @summary Reaped, not merely signalled.
 *
 * A caller removes the child's working directory the moment this resolves, so "resolved" has to mean
 * the child can no longer write. The failure that produced this module was resolving on `kill()`,
 * which returns while the process is still alive.
 *
 * The second failure was the oracle: a signal-terminated child reports `exitCode === null`, so any
 * check of `exitCode` alone reads a correctly-reaped daemon as still running — failing a healthy
 * teardown — and sends an already-dead child down the full wait path.
 */
test.describe('terminateDaemon — resolves only once the child is reaped', () => {
    test('a SIGTERM-ignoring child is waited through SIGKILL, and reports reaped', async () => {
        const child = await spawnStubborn();

        const result = await terminateDaemon(child, FAST);

        expect(result.reaped).toBe(true);
        expect(result.outcome).toBe(REAP_OUTCOME.exited);
        expect(result.signal).toBe('SIGKILL');
        // The child is genuinely gone by the time this resolves — the property a caller relies on
        // before touching its workspace.
        expect(isProcessTerminated(child)).toBe(true);
    });

    test('THE MISCLASSIFICATION: that reaped child reports exitCode null, so exitCode is not the oracle', async () => {
        // This spec exists because the first repair asserted `exitCode !== null` in teardown, which
        // fails on exactly the success path the repair itself introduces. Pinned so the oracle
        // cannot quietly regress to the field that cannot answer.
        const child = await spawnStubborn();

        const result = await terminateDaemon(child, FAST);

        expect(result.reaped).toBe(true);
        expect(child.exitCode).toBeNull();          // ← what a naive oracle would read as "still live"
        expect(child.signalCode).toBe('SIGKILL');   // ← where the terminal state actually is
    });

    test('a compliant child exits on SIGTERM without escalation', async () => {
        // Positive control: without it, every assertion above is satisfied by a function that always
        // force-kills, and the graceful path would go untested.
        const child = await spawnCompliant();

        const result = await terminateDaemon(child, FAST);

        expect(result.reaped).toBe(true);
        expect(result.signal).toBe('SIGTERM');
        expect(result.outcome).toBe(REAP_OUTCOME.exited);
    });

    test('an ALREADY signal-reaped child returns immediately, not after the full wait', async () => {
        // The other half of the misclassification: `exitCode !== null` does not match a
        // signal-terminated child either, so it fell through to the wait path and cost the full
        // grace + reap window per case.
        const child = await spawnStubborn();

        child.kill('SIGKILL');
        await new Promise(resolve => child.once('exit', resolve));

        const startedAt = process.hrtime.bigint();
        const result    = await terminateDaemon(child, FAST);
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

        expect(result.outcome).toBe(REAP_OUTCOME.alreadyExited);
        expect(result.reaped).toBe(true);
        expect(result.signal).toBe('SIGKILL');
        // Comfortably below the injected grace, so this asserts the fast path rather than a fast machine.
        expect(elapsedMs).toBeLessThan(FAST.sigtermGraceMs);
    });

    test('an UNREAPABLE child resolves reaped:false — a timeout must not read as completion', async () => {
        // A stub that accepts signals and never exits. The caller contract is that `reaped: false`
        // forbids touching the workspace; a timeout that reported success would authorise removing a
        // directory whose owner is still alive, which is the original defect wearing a bound.
        const neverExits = {exitCode: null, signalCode: null, kill: () => true, once: () => {}};

        const result = await terminateDaemon(neverExits, {sigtermGraceMs: 20, sigkillReapMs: 40});

        expect(result.reaped).toBe(false);
        expect(result.outcome).toBe(REAP_OUTCOME.unreaped);
        expect(result.signal).toBe('SIGKILL-timeout');
    });

    test('isProcessTerminated recognises BOTH terminal states, and neither for a live child', async () => {
        expect(isProcessTerminated(undefined)).toBe(true);
        expect(isProcessTerminated({exitCode: 0,    signalCode: null})).toBe(true);
        expect(isProcessTerminated({exitCode: null, signalCode: 'SIGKILL'})).toBe(true);
        expect(isProcessTerminated({exitCode: null, signalCode: null})).toBe(false);

        const live = await spawnCompliant();

        expect(isProcessTerminated(live)).toBe(false);
        await terminateDaemon(live, FAST);
    });
});
