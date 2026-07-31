import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'BoundedRetryGateTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../../../src/Neo.mjs';
import * as core                from '../../../../../../src/core/_export.mjs';
import {createBoundedRetryGate} from '../../../../../../ai/services/shared/boundedRetryGate.mjs';

/**
 * Pure suite for the shared bounded-retry primitive: single-flight, failure backoff with cap,
 * cadence-accurate healthy ticks, generation rotation + drain, reader purity, and the on-demand
 * runNow escape hatch. Time is injected; the operation is a controllable stub — no timers.
 */
test.describe('Neo.ai.services.shared.boundedRetryGate', () => {

    function makeGate({results = [], failureTtlMs = 30000, failureTtlMaxMs = 600000} = {}) {
        let   t     = 1_000_000;
        let   calls = 0;
        const gate  = createBoundedRetryGate({
            run: async () => {
                calls++;
                const next = results.shift() ?? {status: 'healthy', durationMs: 1};
                if (next instanceof Error) throw next;
                if (typeof next === 'function') return next();
                return next;
            },
            failureTtlMs, failureTtlMaxMs,
            now: () => t
        });
        return {gate, callCount: () => calls, advance: ms => { t += ms }};
    }

    test('a tick storm produces exactly ONE attempt (single-flight join)', async () => {
        const {gate, callCount} = makeGate();
        const results           = await Promise.all(Array.from({length: 8}, () => gate.tick({key: 'k'})));

        expect(callCount()).toBe(1);
        expect(results.every(r => r.status === 'healthy')).toBe(true);
    });

    test('healthy ticks are cadence-accurate: every tick runs — the caller owns the period', async () => {
        const {gate, callCount, advance} = makeGate();

        await gate.tick({key: 'k'});
        advance(60000);
        await gate.tick({key: 'k'});
        advance(60000);
        await gate.tick({key: 'k'});

        // No second TTL on top of the scheduler: three ticks, three attempts.
        expect(callCount()).toBe(3);
    });

    test('FAILURES cache: ticks inside the backoff window run nothing and report why', async () => {
        const {gate, callCount, advance} = makeGate({results: [{status: 'failed', error: 'saturated'}]});
        const first                      = await gate.tick({key: 'k'});

        expect(first.status).toBe('failed');
        expect(callCount()).toBe(1);

        advance(1000);
        for (let i = 0; i < 10; i++) await gate.tick({key: 'k'});
        expect(callCount()).toBe(1);

        const cached = await gate.tick({key: 'k'});
        expect(cached.gate.cached).toBe(true);
        expect(cached.gate.failureStreak).toBe(1);
        expect(cached.gate.backoffMs).toBe(30000);
        expect(cached.gate.nextAttemptAt).toBe(1_000_000 + 30000);
    });

    test('consecutive failures back off exponentially up to the cap', async () => {
        const fail                       = () => ({status: 'failed', error: 'x'});
        const {gate, callCount, advance} = makeGate({
            results        : [fail(), fail(), fail(), fail(), fail(), fail()],
            failureTtlMs   : 1000,
            failureTtlMaxMs: 4000
        });

        await gate.tick({key: 'k'});                       // streak 1, window 1000
        advance(1001); await gate.tick({key: 'k'});        // streak 2, window 2000
        advance(1500); await gate.tick({key: 'k'});        // inside window 2000 -> cached
        expect(callCount()).toBe(2);

        advance(600);  await gate.tick({key: 'k'});        // past 2000 -> streak 3, window 4000
        advance(4001); await gate.tick({key: 'k'});        // streak 4, window capped at 4000
        expect(callCount()).toBe(4);

        const last = await gate.tick({key: 'k'});
        expect(last.gate.backoffMs).toBe(4000);            // cap holds
    });

    test('recovery is autonomous: after the window a healthy run resets the streak', async () => {
        const {gate, callCount, advance} = makeGate({
            results     : [{status: 'failed', error: 'x'}, {status: 'healthy', durationMs: 2}],
            failureTtlMs: 1000
        });

        await gate.tick({key: 'k'});
        advance(1001);
        const recovered = await gate.tick({key: 'k'});

        expect(recovered.status).toBe('healthy');
        expect(recovered.gate.failureStreak).toBe(0);
        expect(callCount()).toBe(2);
    });

    test('readLast NEVER runs and reports pending before the first settle', async () => {
        const {gate, callCount} = makeGate();

        for (let i = 0; i < 5; i++) {
            expect(gate.readLast().status).toBe('pending');
        }
        expect(callCount()).toBe(0);

        await gate.tick({key: 'k'});
        expect(gate.readLast().status).toBe('healthy');
        expect(callCount()).toBe(1);
    });

    test('a THROWN run counts as a failed attempt and backs off (never a cached rejection)', async () => {
        const {gate, callCount, advance} = makeGate({
            results     : [new Error('boom'), {status: 'healthy', durationMs: 1}],
            failureTtlMs: 1000
        });

        const first = await gate.tick({key: 'k'});
        expect(first.status).toBe('failed');
        expect(first.error).toContain('boom');
        expect(gate.state().failureStreak).toBe(1);

        await gate.tick({key: 'k'});
        expect(callCount()).toBe(1);

        advance(1001);
        expect((await gate.tick({key: 'k'})).status).toBe('healthy');
    });

    test('key rotation is a generation boundary: no inherited streak, no inherited cache', async () => {
        const {gate, advance} = makeGate({
            results     : [{status: 'failed', error: 'a-broken'}, {status: 'healthy'}],
            failureTtlMs: 60000
        });

        await gate.tick({key: 'A'});
        expect(gate.state()).toMatchObject({key: 'A', failureStreak: 1});

        // B starts clean: A's failure streak and backoff window do not apply, so B runs
        // immediately even though A is deep inside its backoff window.
        advance(1);
        const b = await gate.tick({key: 'B'});
        expect(b.status).toBe('healthy');
        expect(b.gate.key).toBe('B');
        expect(gate.state()).toMatchObject({key: 'B', failureStreak: 0});
        expect(gate.readLast().status).toBe('healthy');
    });

    test('a rotated-away in-flight run DRAINS: its result is never delivered to the new generation', async () => {
        let releaseA;
        const {gate, callCount} = makeGate({
            results: [
                () => new Promise(resolve => { releaseA = () => resolve({status: 'failed', error: 'A-late'}) }),
                {status: 'healthy'}
            ]
        });

        const aFlight = gate.tick({key: 'A'});          // in flight, unresolved
        const b       = await gate.tick({key: 'B'});    // rotation while A flies

        expect(b.status).toBe('healthy');
        expect(callCount()).toBe(2);

        releaseA();
        const aResult = await aFlight;

        // A's caller still gets A's real result, but the CURRENT generation is untouched:
        // no cache overwrite, no streak inheritance, readLast still serves B.
        expect(aResult.status).toBe('failed');
        expect(gate.readLast().status).toBe('healthy');
        expect(gate.state()).toMatchObject({key: 'B', failureStreak: 0, inFlight: false});
    });

    test('runNow ignores the failure-backoff window but never overlaps an in-flight run', async () => {
        let releaseSlow;
        const {gate, callCount, advance} = makeGate({
            results: [
                {status: 'failed', error: 'x'},
                () => new Promise(resolve => { releaseSlow = () => resolve({status: 'healthy'}) })
            ],
            failureTtlMs: 60000
        });

        await gate.tick({key: 'k'});
        advance(1);

        // tick respects the window; runNow does not.
        await gate.tick({key: 'k'});
        expect(callCount()).toBe(1);

        const forced = gate.runNow({key: 'k'});
        expect(callCount()).toBe(2);

        // A concurrent runNow JOINS the in-flight attempt instead of overlapping it.
        const joined = gate.runNow({key: 'k'});
        expect(callCount()).toBe(2);

        releaseSlow();
        expect((await forced).status).toBe('healthy');
        expect((await joined).status).toBe('healthy');
    });
});
