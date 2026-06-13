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

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../../src/Neo.mjs';
import * as core         from '../../../../../src/core/_export.mjs';
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
        const queue   = new InteractiveBatchQueue();
        let inFlight  = 0,
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
});
