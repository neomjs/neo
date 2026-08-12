import {setup} from '../../../setup.mjs';

const appName = 'AiProviderInteractiveBatchQueueTest';

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

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../src/Neo.mjs';
import * as core             from '../../../../../src/core/_export.mjs';
import InteractiveBatchQueue from '../../../../../ai/provider/InteractiveBatchQueue.mjs';

/**
 * A deferred whose resolution the test controls — lets a spec hold a task "in flight" so it can
 * enqueue more work behind a non-preemptible running task before releasing it.
 */
function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej });
    return {promise, resolve, reject};
}

test.describe('Neo.ai.provider.InteractiveBatchQueue', () => {
    test('runs an interactive task ahead of queued batch work (admission-order preemption)', async () => {
        const queue = new InteractiveBatchQueue(),
              ran   = [],
              gate  = deferred();

        // B1 starts immediately and is held in flight via the gate, so B2 + I1 queue behind it.
        const p1 = queue.enqueue(async () => { ran.push('B1'); await gate.promise; return 'B1' }, 'batch');
        const p2 = queue.enqueue(async () => { ran.push('B2'); return 'B2' }, 'batch');
        const p3 = queue.enqueue(async () => { ran.push('I1'); return 'I1' }, 'interactive');

        // Only B1 has started; B2 + I1 are still queued behind the in-flight B1.
        expect(ran).toEqual(['B1']);

        gate.resolve();
        await Promise.all([p1, p2, p3]);

        // I1 (interactive, enqueued last) jumped ahead of the earlier-queued B2 (batch).
        expect(ran).toEqual(['B1', 'I1', 'B2']);
    });

    test('keeps FIFO order within a single priority lane', async () => {
        const queue = new InteractiveBatchQueue(),
              ran   = [];

        await Promise.all([
            queue.enqueue(async () => { ran.push('I1') }, 'interactive'),
            queue.enqueue(async () => { ran.push('I2') }, 'interactive'),
            queue.enqueue(async () => { ran.push('I3') }, 'interactive')
        ]);

        expect(ran).toEqual(['I1', 'I2', 'I3']);
    });

    test('defaults an unspecified priority to interactive', async () => {
        const queue = new InteractiveBatchQueue(),
              ran   = [],
              gate  = deferred();

        const p1 = queue.enqueue(async () => { ran.push('held'); await gate.promise }, 'batch');
        const p2 = queue.enqueue(async () => { ran.push('batch')  }, 'batch');
        const p3 = queue.enqueue(async () => { ran.push('default') }); // no priority arg

        gate.resolve();
        await Promise.all([p1, p2, p3]);

        // the default-priority task preempted the explicit batch task → it is treated as interactive
        expect(ran).toEqual(['held', 'default', 'batch']);
    });

    test('never runs two tasks concurrently (one-at-a-time on the serialized lane)', async () => {
        const queue    = new InteractiveBatchQueue();
        let   inFlight = 0,
            maxInFlight = 0;

        const task = () => async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await Promise.resolve(); // yield the event loop mid-task
            inFlight--;
        };

        await Promise.all([
            queue.enqueue(task(), 'interactive'),
            queue.enqueue(task(), 'batch'),
            queue.enqueue(task(), 'interactive')
        ]);

        expect(maxInFlight).toBe(1);
    });

    test('a throwing task rejects its own promise without blocking the lane', async () => {
        const queue = new InteractiveBatchQueue(),
              ran   = [];

        const failing = queue.enqueue(async () => { throw new Error('boom') }, 'interactive');
        const after   = queue.enqueue(async () => { ran.push('after'); return 'ok' }, 'interactive');

        await expect(failing).rejects.toThrow('boom');
        await expect(after).resolves.toBe('ok');
        expect(ran).toEqual(['after']); // the lane kept draining after the rejection
    });

    test('records deterministic queue wait and execution without changing interactive-first order', async () => {
        const ticks     = [0, 10, 20, 30, 40, 50, 60, 70, 80];
        const queue     = new InteractiveBatchQueue({now: () => ticks.shift()});
        const ran       = [];
        const events    = [];
        const gate      = deferred();
        const lifecycle = label => ({
            onEnqueued: event => events.push({label, type: 'enqueued', ...event}),
            onStarted : event => events.push({label, type: 'started',  ...event}),
            onSettled : event => events.push({label, type: 'settled',  ...event})
        });

        const p1 = queue.enqueue(async () => { ran.push('B1'); await gate.promise }, 'batch', lifecycle('B1'));
        const p2 = queue.enqueue(async () => { ran.push('B2') }, 'batch', lifecycle('B2'));
        const p3 = queue.enqueue(async () => { ran.push('I1') }, 'interactive', lifecycle('I1'));

        gate.resolve();
        await Promise.all([p1, p2, p3]);

        expect(ran).toEqual(['B1', 'I1', 'B2']);
        expect(events.filter(event => event.label === 'I1')).toEqual([
            {label: 'I1', type: 'enqueued', enqueuedAt: 30, priority: 'interactive'},
            {label: 'I1', type: 'started', enqueuedAt: 30, priority: 'interactive', queueWaitMs: 20, startedAt: 50},
            {label: 'I1', type: 'settled', completedAt: 60, enqueuedAt: 30, executionMs: 10, priority: 'interactive', startedAt: 50, success: true}
        ]);
    });

    test('lifecycle observer failures cannot alter task results or lane draining', async () => {
        const queue             = new InteractiveBatchQueue();
        const throwingLifecycle = {
            onEnqueued() { throw new Error('observer enqueue failed') },
            onStarted()  { throw new Error('observer start failed') },
            onSettled()  { throw new Error('observer settle failed') }
        };

        const first  = queue.enqueue(async () => 'ok', 'interactive', throwingLifecycle);
        const second = queue.enqueue(async () => { throw new Error('task failed') }, 'batch', throwingLifecycle);
        const third  = queue.enqueue(async () => 'after', 'batch', throwingLifecycle);

        await expect(first).resolves.toBe('ok');
        await expect(second).rejects.toThrow('task failed');
        await expect(third).resolves.toBe('after');
    });

    test.describe('admission capacity', () => {
        test('DEFAULT capacity is 1 and still serializes — the pre-capacity behaviour', () => {
            // The control for every arm below. If this drifts, the shared chat queue silently gained
            // concurrency against a SHARED endpoint, which moves contention into the model server
            // instead of removing it.
            const queue = new InteractiveBatchQueue(),
                  ran   = [],
                  gate  = deferred();

            expect(queue.capacity).toBe(1);

            queue.enqueue(async () => { ran.push('A'); await gate.promise });
            queue.enqueue(async () => { ran.push('B') });

            expect(ran).toEqual(['A']);
            gate.resolve();
        });

        test('capacity 2 admits BOTH tasks in the same tick — the whole point of the bound', async () => {
            // Two asks arriving seconds apart must both be served. A single-lane queue serializes
            // them no matter how much idle capacity the endpoint has, so this arm is the one that
            // distinguishes "the endpoint is busy" from "the queue admitted one".
            const queue = new InteractiveBatchQueue({capacity: 2}),
                  ran   = [],
                  gateA = deferred(),
                  gateB = deferred();

            const pA = queue.enqueue(async () => { ran.push('A'); await gateA.promise; return 'A' });
            const pB = queue.enqueue(async () => { ran.push('B'); await gateB.promise; return 'B' });

            // Synchronously after both enqueues: BOTH are in flight. Not "eventually" — an async gap
            // in slot-filling would reintroduce serialization while still reporting capacity 2.
            expect(ran).toEqual(['A', 'B']);

            gateA.resolve();
            gateB.resolve();

            await expect(pA).resolves.toBe('A');
            await expect(pB).resolves.toBe('B');
        });

        test('capacity is an upper BOUND — a third task waits for a freed slot', async () => {
            const queue = new InteractiveBatchQueue({capacity: 2}),
                  ran   = [],
                  gates = [deferred(), deferred(), deferred()];

            const promises = gates.map((gate, i) => queue.enqueue(async () => {
                ran.push(i);
                await gate.promise;
                return i
            }));

            // Bounded at 2 even though 3 are queued.
            expect(ran).toEqual([0, 1]);

            // Freeing ONE slot admits exactly one more, not the remainder.
            gates[0].resolve();
            await promises[0];

            expect(ran).toEqual([0, 1, 2]);

            gates[1].resolve();
            gates[2].resolve();
            await Promise.all(promises);
        });

        test('a THROWING task releases its slot — capacity does not leak', async () => {
            // A leaked slot is the worst failure mode here: it degrades silently, one task per
            // failure, until the queue is permanently narrower than configured. Nothing in a latency
            // measurement would name it, so it gets an arm rather than trust.
            const queue = new InteractiveBatchQueue({capacity: 2}),
                  ran   = [];

            const failing = Promise.all([
                queue.enqueue(async () => { ran.push('x'); throw new Error('boom') }),
                queue.enqueue(async () => { ran.push('y'); throw new Error('boom') })
            ].map(p => p.catch(() => 'handled')));

            await failing;

            const gateC = deferred(),
                  gateD = deferred(),
                  pC    = queue.enqueue(async () => { ran.push('C'); await gateC.promise; return 'C' }),
                  pD    = queue.enqueue(async () => { ran.push('D'); await gateD.promise; return 'D' });

            // Full capacity is still available after two failures.
            expect(ran).toEqual(['x', 'y', 'C', 'D']);

            gateC.resolve();
            gateD.resolve();
            await Promise.all([pC, pD]);
        });

        test('interactive is still preferred when a slot frees under capacity > 1', async () => {
            // Selection happens when a slot FREES, not when the queue was built. Without that, the
            // documented lane preference would quietly stop holding above capacity 1 — the contract
            // regressing in exactly the configuration that is new.
            const queue = new InteractiveBatchQueue({capacity: 2}),
                  ran   = [],
                  gates = [deferred(), deferred()];

            queue.enqueue(async () => { ran.push('B1'); await gates[0].promise }, 'batch');
            queue.enqueue(async () => { ran.push('B2'); await gates[1].promise }, 'batch');

            const pBatch       = queue.enqueue(async () => { ran.push('B3') }, 'batch'),
                  pInteractive = queue.enqueue(async () => { ran.push('I1') }, 'interactive');

            expect(ran).toEqual(['B1', 'B2']);

            gates[0].resolve();
            gates[1].resolve();
            await Promise.all([pBatch, pInteractive]);

            // I1 was enqueued AFTER B3 and still ran first.
            expect(ran.indexOf('I1')).toBeLessThan(ran.indexOf('B3'));
        });

        test('an unusable capacity is REFUSED at construction, not at admission', () => {
            // A 0 or negative capacity makes `#running < #capacity` false forever: every task sits
            // queued and the caller sees a hung provider, with nothing in the logs naming the cause.
            // Fractional is refused too — 1.5 would round somewhere and the operator's number would
            // not be the behaviour.
            expect(() => new InteractiveBatchQueue({capacity: 0})).toThrow(/capacity must be an integer >= 1/);
            expect(() => new InteractiveBatchQueue({capacity: -1})).toThrow(/capacity must be an integer >= 1/);
            expect(() => new InteractiveBatchQueue({capacity: 1.5})).toThrow(/capacity must be an integer >= 1/);
            expect(() => new InteractiveBatchQueue({capacity: '2'})).toThrow(/capacity must be an integer >= 1/);

            // Control: a valid capacity constructs, so the guard is not simply rejecting everything.
            expect(new InteractiveBatchQueue({capacity: 4}).capacity).toBe(4);
        });

        test('queueWaitMs distinguishes an ADMITTED task from a QUEUED one', async () => {
            // The witness for the dedicated-endpoint work is judged on persisted queue wait, so the
            // number this queue reports has to mean what that judgement assumes: ~0 for a task that
            // was admitted immediately, and the wait actually served for one that queued.
            let clock = 1000;

            const queue   = new InteractiveBatchQueue({capacity: 1, now: () => clock}),
                  waits   = [],
                  gate    = deferred(),
                  observe = {onStarted: ({queueWaitMs}) => waits.push(queueWaitMs)};

            const pA = queue.enqueue(async () => { await gate.promise }, 'interactive', observe);

            queue.enqueue(async () => {}, 'interactive', observe);

            expect(waits).toEqual([0]);

            clock = 1750;
            gate.resolve();
            await pA;

            expect(waits).toEqual([0, 750]);
        });
    });
});
