import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ReplyLossTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import WorkerBase     from '../../../../src/worker/Base.mjs';

/**
 * @summary Regression net for worker reply loss on a null port lookup (the blank-app init wedge).
 *
 * The defect family: a SharedWorker reply whose `opts.port` referenced a port which disconnected
 * (or was not yet registered) between message receipt and reply threw a `TypeError` inside
 * `sendMessage`, the exception escaped `resolve()` / `reject()`, the reply never posted, and the
 * caller-side promise never settled — `isVdomUpdating` stuck `true`, `vnode: null`, blank app,
 * zero errors (Electron-deterministic, 3/3).
 *
 * Pinned contracts:
 * 1. Port resolution falls through the routing keys (`opts.port` → `opts.windowId` → `opts.appName`)
 *    instead of short-circuiting on a stale key — a reply with a live sibling key gets DELIVERED.
 * 2. A keyed message with no resolvable route returns `undefined` without throwing and is never
 *    misrouted into a foreign window's port.
 * 3. `resolve()` / `reject()` cannot throw on a dead route; the loss is logged with routing context.
 */
class ReplyLossWorker extends WorkerBase {
    static config = {
        className: 'Test.Unit.Worker.ReplyLossWedgeWorker'
    }

    construct(config) {
        super.construct(config);
        // Simulate the SharedWorker environment BEFORE onConstructed() runs, so the
        // dedicated-worker 'workerConstructed' announcement (which needs a main thread)
        // never fires inside the single-threaded unit env.
        this.isSharedWorker = true
    }
}
Neo.setupClass(ReplyLossWorker);

const createCapturingPort = () => {
    const sent = [];

    return {
        sent,
        port: {
            postMessage(message) {
                sent.push(message)
            }
        }
    }
};

const createSharedWorker = portSpecs => {
    const worker = Neo.create(ReplyLossWorker, {workerId: 'reply-loss-test'});

    worker.ports.push(...portSpecs);

    return worker
};

test.describe('Worker reply loss on null port lookup (#12958)', () => {
    test('sendMessage: a stale opts.port falls through to the windowId lookup (reply rescued)', () => {
        const {port, sent} = createCapturingPort();
        const worker       = createSharedWorker([
            {appName: 'ReplyLossApp', id: 'port-fresh', port, windowId: 'win-1'}
        ]);

        // dest 'app' resolves no direct port (no worker channel yet — the init race);
        // opts.port is stale; opts.windowId still names the same logical target.
        const message = worker.sendMessage('app', {
            action  : 'reply',
            port    : 'port-stale',
            replyId : 'q-1',
            windowId: 'win-1'
        });

        expect(message).toBeDefined();
        expect(sent.length).toBe(1);
        expect(sent[0].replyId).toBe('q-1');
        expect(sent[0].port).toBe('port-fresh') // re-keyed to the live port id
    });

    test('sendMessage: a stale opts.port falls through to the appName lookup', () => {
        const {port, sent} = createCapturingPort();
        const worker       = createSharedWorker([
            {appName: 'ReplyLossApp', id: 'port-fresh', port, windowId: 'win-1'}
        ]);

        const message = worker.sendMessage('app', {
            action : 'reply',
            appName: 'ReplyLossApp',
            port   : 'port-stale',
            replyId: 'q-2'
        });

        expect(message).toBeDefined();
        expect(sent.length).toBe(1);
        expect(sent[0].replyId).toBe('q-2')
    });

    test('sendMessage: a keyed message with no resolvable route returns undefined without throwing and never misroutes', () => {
        const {port, sent} = createCapturingPort();
        const worker       = createSharedWorker([
            {appName: 'OtherApp', id: 'port-other', port, windowId: 'win-other'}
        ]);

        let message;

        expect(() => {
            message = worker.sendMessage('app', {
                action  : 'reply',
                port    : 'port-stale',
                replyId : 'q-3',
                windowId: 'win-gone'
            })
        }).not.toThrow();

        expect(message).toBeUndefined();
        expect(sent.length).toBe(0) // a keyed reply must not land in a foreign window's port
    });

    test('sendMessage: a keyless message with no connected ports returns undefined without throwing', () => {
        const worker = createSharedWorker([]);

        let message;

        expect(() => {
            message = worker.sendMessage('app', {action: 'reply', replyId: 'q-4'})
        }).not.toThrow();

        expect(message).toBeUndefined()
    });

    test('sendMessage: a keyless message still uses the last-resort first port', () => {
        const {port, sent} = createCapturingPort();
        const worker       = createSharedWorker([
            {appName: 'ReplyLossApp', id: 'port-fresh', port, windowId: 'win-1'}
        ]);

        const message = worker.sendMessage('app', {action: 'reply', replyId: 'q-5'});

        expect(message).toBeDefined();
        expect(sent.length).toBe(1);
        expect(sent[0].replyId).toBe('q-5')
    });

    test('resolve(): a dead reply route cannot throw and logs the loss with routing context', () => {
        const worker        = createSharedWorker([]);
        const errors        = [];
        const originalError = console.error;

        console.error = (...args) => errors.push(args);

        try {
            expect(() => {
                worker.resolve({id: 'q-6', origin: 'app', port: 'port-stale', windowId: 'win-gone'}, {ok: true})
            }).not.toThrow()
        } finally {
            console.error = originalError
        }

        expect(errors.length).toBe(1);
        expect(errors[0][0]).toContain('will not settle');
        expect(errors[0][1].replyId).toBe('q-6')
    });

    test('reject(): a dead reply route cannot throw and logs the loss with routing context', () => {
        const worker        = createSharedWorker([]);
        const errors        = [];
        const originalError = console.error;

        console.error = (...args) => errors.push(args);

        try {
            expect(() => {
                worker.reject({id: 'q-7', origin: 'app', port: 'port-stale', windowId: 'win-gone'}, new Error('remote failed'))
            }).not.toThrow()
        } finally {
            console.error = originalError
        }

        expect(errors.length).toBe(1);
        expect(errors[0][0]).toContain('will not settle');
        expect(errors[0][1].replyId).toBe('q-7')
    });

    test('resolve(): a live route still delivers the reply (no regression)', () => {
        const {port, sent} = createCapturingPort();
        const worker       = createSharedWorker([
            {appName: 'ReplyLossApp', id: 'port-fresh', port, windowId: 'win-1'}
        ]);

        worker.resolve({id: 'q-8', origin: 'app', port: 'port-stale', windowId: 'win-1'}, {ok: true});

        expect(sent.length).toBe(1);
        expect(sent[0].replyId).toBe('q-8');
        expect(sent[0].reject).toBeUndefined()
    });
});
