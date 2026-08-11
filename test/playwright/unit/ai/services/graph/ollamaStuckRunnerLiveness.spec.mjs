import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

import {
    classifyStuckRunner,
    probeOllamaServing
} from '../../../../../../ai/services/graph/ollamaStuckRunnerLiveness.mjs';

test.describe('ollamaStuckRunnerLiveness (stuck-runner detect)', () => {
    test.describe('classifyStuckRunner', () => {
        test('a served canary clears suspicion — alive, counter reset', () => {
            expect(classifyStuckRunner({served: true, consecutiveFailures: 5, threshold: 3}))
                .toEqual({alive: true, stuck: false, consecutiveFailures: 0});
        });

        test('failures below threshold stay alive — advisory, counter increments', () => {
            expect(classifyStuckRunner({served: false, consecutiveFailures: 0, threshold: 3}))
                .toEqual({alive: true, stuck: false, consecutiveFailures: 1});
            expect(classifyStuckRunner({served: false, consecutiveFailures: 1, threshold: 3}))
                .toEqual({alive: true, stuck: false, consecutiveFailures: 2});
        });

        test('sustained failure reaching threshold classifies stuck — restart, counter reset', () => {
            expect(classifyStuckRunner({served: false, consecutiveFailures: 2, threshold: 3}))
                .toEqual({alive: false, stuck: true, consecutiveFailures: 0});
        });

        test('threshold=1 restarts on the first failure (no hysteresis)', () => {
            expect(classifyStuckRunner({served: false, consecutiveFailures: 0, threshold: 1}))
                .toEqual({alive: false, stuck: true, consecutiveFailures: 0});
        });

        test('the false-positive guard: a long request that finally serves does NOT restart', () => {
            // Two failed canaries (a legitimately-slow request in flight), then it completes.
            let {consecutiveFailures} = classifyStuckRunner({served: false, consecutiveFailures: 0, threshold: 3});
            ({consecutiveFailures} = classifyStuckRunner({served: false, consecutiveFailures, threshold: 3}));
            const recovered = classifyStuckRunner({served: true, consecutiveFailures, threshold: 3});
            expect(recovered).toEqual({alive: true, stuck: false, consecutiveFailures: 0});
        });

        test('rejects a non-positive-integer threshold', () => {
            expect(() => classifyStuckRunner({served: false, threshold: 0})).toThrow(/threshold/);
            expect(() => classifyStuckRunner({served: false, threshold: 2.5})).toThrow(/threshold/);
        });
    });

    test.describe('probeOllamaServing', () => {
        test('a completed response means the runner is serving', async () => {
            const okFetch = async () => ({ok: true});
            expect(await probeOllamaServing({host: 'http://ollama.test', model: 'gemma4:26b', timeoutMs: 50, fetchFn: okFetch})).toBe(true);
        });

        test('a completed non-2xx response still means serving — a fast model/config error is NOT stuck', async () => {
            // The false-positive guard: a runner that answers promptly with a 4xx/5xx is responsive,
            // not queued behind a grind. It must NOT be counted toward a recycle (Cycle-2 fix).
            const errorFetch = async () => ({ok: false, status: 500});
            expect(await probeOllamaServing({host: 'http://ollama.test', model: 'gemma4:26b', timeoutMs: 50, fetchFn: errorFetch})).toBe(true);
        });

        test('a thrown/aborted request means not serving (the stuck signature)', async () => {
            const throwingFetch = async () => { throw new Error('aborted'); };
            expect(await probeOllamaServing({host: 'http://ollama.test', model: 'gemma4:26b', timeoutMs: 50, fetchFn: throwingFetch})).toBe(false);
        });

        test('a timeout (never resolves before timeoutMs) aborts → not serving', async () => {
            const hangingFetch = (url, {signal}) => new Promise((_, reject) => {
                signal.addEventListener('abort', () => reject(new Error('aborted')));
            });
            expect(await probeOllamaServing({host: 'http://ollama.test', model: 'gemma4:26b', timeoutMs: 20, fetchFn: hangingFetch})).toBe(false);
        });

        test('strips a trailing slash and hits /api/chat', async () => {
            let calledUrl, calledBody;
            const captureFetch = async (url, opts) => { calledUrl = url; calledBody = JSON.parse(opts.body); return {ok: true}; };
            await probeOllamaServing({host: 'http://ollama.test/', model: 'gemma4:26b', timeoutMs: 50, fetchFn: captureFetch});
            expect(calledUrl).toBe('http://ollama.test/api/chat');
            expect(calledBody).toMatchObject({model: 'gemma4:26b', stream: false, options: {num_predict: 1}});
        });

        test('rejects missing host/model or non-positive timeout', async () => {
            await expect(probeOllamaServing({model: 'x', timeoutMs: 10})).rejects.toThrow(/host and model/);
            await expect(probeOllamaServing({host: 'h', model: 'm', timeoutMs: 0})).rejects.toThrow(/timeoutMs/);
        });
    });
});
