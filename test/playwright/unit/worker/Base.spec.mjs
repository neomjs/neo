import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkerBaseTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import WorkerBase     from '../../../../src/worker/Base.mjs';

/**
 * @summary The dead-port rejection contract of `worker.Base#promiseMessage`.
 *
 * When `sendMessage` resolves no live port (a window closed; SharedWorkers), the returned
 * promise must reject with a TYPED reason — `code: 'NEO_DEAD_PORT'` — whose message names the
 * destination and, for remote-method calls, the remote target. Both halves are load-bearing:
 *
 * 1. The `code` is the machine discriminator: `draggable.DragZone#destroyDragProxy` settles
 *    closed-window teardown silently on exactly this code (its own spec pins that seam).
 * 2. The message context is the human/log surface: an app-level `unhandledrejection` logger
 *    previously printed `undefined` with no way to name the caller — the field defect.
 *
 * The message duplicates the discriminator's meaning ("no live port") because envelope
 * forwarding between realms may preserve only the string.
 */
class DeadPortWorker extends WorkerBase {
    static config = {
        className: 'Test.Unit.Worker.DeadPortWorker'
    }

    construct(config) {
        super.construct(config);
        // Simulate the SharedWorker environment BEFORE onConstructed() runs, so the
        // dedicated-worker 'workerConstructed' announcement (which needs a main thread)
        // never fires inside the single-threaded unit env.
        this.isSharedWorker = true
    }
}
Neo.setupClass(DeadPortWorker);

test.describe('worker.Base#promiseMessage dead-port rejection (#17894)', () => {
    let worker;

    test.beforeEach(() => {
        // No ports at all: every keyed route resolves nothing, sendMessage returns undefined
        // without throwing (the contract ReplyLoss.spec pins), and the dead-port branch fires.
        worker = Neo.create(DeadPortWorker, {workerId: 'dead-port-test'})
    });

    test.afterEach(() => {
        worker.destroy?.()
    });

    test('the rejection is a typed Error naming the destination and action', async () => {
        const reason = await worker
            .promiseMessage('app', {action: 'loadApplication', windowId: 'win-404'})
            .catch(e => e);

        expect(reason).toBeInstanceOf(Error);
        expect(reason.code).toBe('NEO_DEAD_PORT');
        expect(reason.message).toContain('no live port');
        expect(reason.message).toContain('destination "app"');
        expect(reason.message).toContain('loadApplication')
    });

    test('a remote-method call carries its remote target in the message', async () => {
        const reason = await worker
            .promiseMessage('app', {
                action         : 'remoteMethod',
                remoteClassName: 'Neo.main.addon.DockFlip',
                remoteMethod   : 'captureFirst',
                windowId       : 'win-404'
            })
            .catch(e => e);

        expect(reason.code).toBe('NEO_DEAD_PORT');
        expect(reason.message).toContain('Neo.main.addon.DockFlip.captureFirst')
    });
});
