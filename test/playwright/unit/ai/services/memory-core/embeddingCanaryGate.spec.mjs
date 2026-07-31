import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'EmbeddingCanaryGateTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect}              from '@playwright/test';
import Neo                         from '../../../../../../src/Neo.mjs';
import * as core                   from '../../../../../../src/core/_export.mjs';
import {createEmbeddingCanaryGate} from '../../../../../../ai/services/memory-core/helpers/embeddingCanaryGate.mjs';

/**
 * Pure-helper suite for the canary gate: single-flight, both-outcome caching, bounded exponential
 * failure backoff, reader-never-runs, and throw-counts-as-failure. Time is injected; the canary
 * is a controllable stub — no provider, no timers.
 */
test.describe('Neo.ai.services.memory-core.helpers.embeddingCanaryGate', () => {

    function makeGate({results = [], healthyTtlMs = 60000, failureTtlMs = 30000, failureTtlMaxMs = 600000} = {}) {
        let   t     = 1_000_000;
        let   calls = 0;
        const gate  = createEmbeddingCanaryGate({
            runCanary: async () => {
                calls++;
                const next = results.shift() ?? {status: 'healthy', durationMs: 1};
                if (next instanceof Error) throw next;
                return next;
            },
            healthyTtlMs, failureTtlMs, failureTtlMaxMs,
            now: () => t
        });
        return {gate, callCount: () => calls, advance: ms => { t += ms }};
    }

    test('a probe storm produces exactly ONE canary attempt (single-flight)', async () => {
        const {gate, callCount} = makeGate();
        const results           = await Promise.all(Array.from({length: 8}, () => gate.probe({key: 'k'})));

        expect(callCount()).toBe(1);
        expect(results.every(r => r.status === 'healthy')).toBe(true);
        // Exactly one caller carries the fresh flag; the joiners share the same settled flight.
        expect(results.every(r => r.gate)).toBe(true);
    });

    test('healthy results cache for their TTL, then refresh', async () => {
        const {gate, callCount, advance} = makeGate();
        await gate.probe({key: 'k'});
        await gate.probe({key: 'k'});
        expect(callCount()).toBe(1);

        advance(60001);
        await gate.probe({key: 'k'});
        expect(callCount()).toBe(2);
    });

    test('FAILURES cache too: probes inside the backoff window run nothing', async () => {
        const {gate, callCount, advance} = makeGate({results: [{status: 'failed', error: 'saturated'}]});
        const first                      = await gate.probe({key: 'k'});
        expect(first.status).toBe('failed');
        expect(callCount()).toBe(1);

        // The regression this gate exists for: under the old cache-only-healthy behavior each of
        // these would have re-run the canary.
        advance(1000);
        for (let i = 0; i < 10; i++) await gate.probe({key: 'k'});
        expect(callCount()).toBe(1);

        const cached = await gate.probe({key: 'k'});
        expect(cached.gate.cached).toBe(true);
        expect(cached.gate.failureStreak).toBe(1);
        expect(cached.gate.backoffMs).toBe(30000);
    });

    test('consecutive failures back off exponentially up to the cap', async () => {
        const fail                       = () => ({status: 'failed', error: 'x'});
        const {gate, callCount, advance} = makeGate({
            results        : [fail(), fail(), fail(), fail(), fail(), fail()],
            failureTtlMs   : 1000,
            failureTtlMaxMs: 4000
        });

        await gate.probe({key: 'k'});                       // streak 1, window 1000
        advance(1001); await gate.probe({key: 'k'});        // streak 2, window 2000
        advance(1500); await gate.probe({key: 'k'});        // still inside window 2000 -> cached
        expect(callCount()).toBe(2);

        advance(600);  await gate.probe({key: 'k'});        // past 2000 -> streak 3, window 4000
        advance(4001); await gate.probe({key: 'k'});        // streak 4, window capped at 4000
        expect(callCount()).toBe(4);

        const last = await gate.probe({key: 'k'});
        expect(last.gate.backoffMs).toBe(4000);             // cap holds
    });

    test('recovery is autonomous: after the window a healthy run resets the streak', async () => {
        const {gate, callCount, advance} = makeGate({
            results     : [{status: 'failed', error: 'x'}, {status: 'healthy', durationMs: 2}],
            failureTtlMs: 1000
        });

        await gate.probe({key: 'k'});
        advance(1001);
        const recovered = await gate.probe({key: 'k'});

        expect(recovered.status).toBe('healthy');
        expect(recovered.gate.failureStreak).toBe(0);
        expect(callCount()).toBe(2);
    });

    test('readLast NEVER runs the canary and reports pending before the first run', async () => {
        const {gate, callCount} = makeGate();

        for (let i = 0; i < 5; i++) {
            expect(gate.readLast().status).toBe('pending');
        }
        expect(callCount()).toBe(0);

        await gate.probe({key: 'k'});
        expect(gate.readLast().status).toBe('healthy');
        expect(callCount()).toBe(1);
    });

    test('a THROWN canary counts as a failed attempt and backs off (never a cached rejection)', async () => {
        const {gate, callCount, advance} = makeGate({
            results     : [new Error('boom'), {status: 'healthy', durationMs: 1}],
            failureTtlMs: 1000
        });

        const first = await gate.probe({key: 'k'});
        expect(first.status).toBe('failed');
        expect(first.error).toContain('boom');
        expect(gate.state().failureStreak).toBe(1);

        // Inside the window: cached failure, no re-run, no rejection surfaced.
        await gate.probe({key: 'k'});
        expect(callCount()).toBe(1);

        advance(1001);
        expect((await gate.probe({key: 'k'})).status).toBe('healthy');
    });

    test('a changed cache key bypasses the cached result', async () => {
        const {gate, callCount} = makeGate();
        await gate.probe({key: 'ollama:4096:30000'});
        await gate.probe({key: 'openAiCompatible:4096:30000'});
        expect(callCount()).toBe(2);
    });
});
