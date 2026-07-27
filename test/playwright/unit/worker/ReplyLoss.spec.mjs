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
    const
        sent  = [],
        state = {closed: false};

    return {
        sent,
        state,
        port: {
            close() {
                state.closed = true
            },
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

test.describe('SharedWorker source-port lifecycle (#15906)', () => {
    test('onConnected binds registration messages to the exact source port', () => {
        const
            first       = createCapturingPort(),
            second      = createCapturingPort(),
            worker      = createSharedWorker([]),
            connections = [];

        worker.onConnected({ports: [first.port]});
        worker.onConnected({ports: [second.port]});
        worker.onConnect = data => connections.push(data);

        second.port.onmessage({
            data: {
                action: 'registerNeoConfig',
                data  : {windowId: 'win-source'}
            }
        });
        second.port.onmessage({
            data: {
                action : 'registerApp',
                appName: 'SourceBoundApp'
            }
        });

        const [firstEntry, sourceEntry] = worker.ports;

        expect(firstEntry.windowId).toBeNull();
        expect([...firstEntry.appNames]).toEqual([]);
        expect(sourceEntry.windowId).toBe('win-source');
        expect([...sourceEntry.appNames]).toEqual(['SourceBoundApp']);
        expect(connections).toHaveLength(1);
        expect(connections[0].sourcePort).toBe(sourceEntry)
    });

    test('one source port preserves every hosted app until its final disconnect', async () => {
        const
            captured     = createCapturingPort(),
            worker       = createSharedWorker([]),
            connected    = [],
            disconnected = [];

        worker.on({
            connect   : data => connected.push(data.appName),
            disconnect: data => disconnected.push(data.appName)
        });
        worker.timeout = () => Promise.resolve();
        worker.onConnected({ports: [captured.port]});

        const [portEntry] = worker.ports;

        portEntry.windowId = 'win-multi-app';
        portEntry.port.onmessage({data: {action: 'registerApp', appName: 'AppA'}});
        portEntry.port.onmessage({data: {action: 'registerApp', appName: 'AppB'}});

        await Promise.resolve();

        expect([...portEntry.appNames]).toEqual(['AppA', 'AppB']);
        expect(connected).toEqual(['AppA', 'AppB']);

        worker.onDisconnect({appName: 'AppA', windowId: 'win-multi-app'}, portEntry);

        expect(worker.ports).toEqual([portEntry]);
        expect([...portEntry.appNames]).toEqual(['AppB']);
        expect(captured.state.closed).toBe(false);
        expect(disconnected).toEqual(['AppA']);

        worker.onDisconnect({appName: 'AppB', windowId: 'win-multi-app'}, portEntry);

        expect(worker.ports).toHaveLength(0);
        expect(captured.state.closed).toBe(true);
        expect(disconnected).toEqual(['AppA', 'AppB'])
    });

    test('disconnect retires the exact source port and drops its queued messages', () => {
        const
            captured  = createCapturingPort(),
            portEntry = {
                appNames: new Set(['DepartedApp']),
                id      : 'port-departed',
                port    : captured.port,
                windowId: 'win-departed'
            },
            worker = createSharedWorker([portEntry]);

        let queuedGeometryDispatches = 0;

        portEntry.port.onmessage = () => {};
        worker.onWindowPositionChange = () => queuedGeometryDispatches++;
        worker.onDisconnect({
            appName : 'DepartedApp',
            windowId: 'win-departed'
        }, portEntry);
        worker.onMessage({
            data: {
                action: 'windowPositionChange',
                data  : {windowId: 'win-departed'}
            }
        }, portEntry);

        expect(worker.ports).toHaveLength(0);
        expect(worker.getPort({windowId: 'win-departed'})).toBeNull();
        expect(portEntry.port.onmessage).toBeNull();
        expect(captured.state.closed).toBe(true);
        expect(queuedGeometryDispatches).toBe(0)
    });

    test('disconnect cleanup stays bounded across unique window ids', () => {
        const worker = createSharedWorker([]);

        for (let index = 0; index < 1000; index++) {
            const portEntry = {
                appNames: new Set(['BoundedApp']),
                id      : `port-${index}`,
                port    : createCapturingPort().port,
                windowId: `win-${index}`
            };

            worker.ports.push(portEntry);
            worker.onDisconnect({
                appName : 'BoundedApp',
                windowId: portEntry.windowId
            }, portEntry)
        }

        expect(worker.ports).toHaveLength(0)
    });

    test('a replacement with identical routing keys cannot complete an old async connect', async () => {
        const
            oldPort  = createCapturingPort(),
            oldEntry = {
                appNames: new Set(['GenerationApp']),
                id      : 'port-generation',
                port    : oldPort.port,
                windowId: 'win-generation'
            },
            worker      = createSharedWorker([oldEntry]),
            connections = [];

        let releaseDelay;

        worker.on({connect: data => connections.push(data)});
        worker.timeout = () => new Promise(resolve => {
            releaseDelay = resolve
        });

        const pendingConnect = worker.onConnect({
            appName   : 'GenerationApp',
            sourcePort: oldEntry,
            windowId  : 'win-generation'
        });

        worker.onDisconnect({
            appName : 'GenerationApp',
            windowId: 'win-generation'
        }, oldEntry);
        worker.ports.push({
            appNames: new Set(['GenerationApp']),
            id      : 'port-generation',
            port    : createCapturingPort().port,
            windowId: 'win-generation'
        });

        releaseDelay();
        await pendingConnect;

        expect(worker.ports).toHaveLength(1);
        expect(connections).toHaveLength(0)
    });

    test('disconnect rejects and deletes promises owned by the retired port', async () => {
        const
            captured  = createCapturingPort(),
            portEntry = {
                appNames: new Set(['PendingApp']),
                id      : 'port-pending',
                port    : captured.port,
                windowId: 'win-pending'
            },
            worker  = createSharedWorker([portEntry]),
            pending = worker.promiseMessage('win-pending', {action: 'pendingReply'});

        const [{id}] = captured.sent;

        worker.onDisconnect({
            appName : 'PendingApp',
            windowId: 'win-pending'
        }, portEntry);

        await expect(pending).rejects.toThrow('Worker port disconnected before reply: port-pending');
        expect(worker.promises[id]).toBeUndefined()
    });

    test('retiring an old entry cannot reject a successor generation promise with the same routing id', async () => {
        const
            oldEntry = {
                appNames: new Set(['GenerationApp']),
                id      : 'port-generation',
                port    : createCapturingPort().port,
                windowId: 'win-generation'
            },
            successorPort = createCapturingPort(),
            successor     = {
                appNames: new Set(['GenerationApp']),
                id      : 'port-generation',
                port    : successorPort.port,
                windowId: 'win-generation'
            },
            worker  = createSharedWorker([oldEntry, successor]),
            pending = worker.promiseMessage('win-generation', {action: 'pendingReply'}),
            [{id}]  = successorPort.sent;

        worker.removePort(oldEntry);

        expect(worker.promises[id]).toBeDefined();

        worker.onMessage({
            data: {
                action : 'reply',
                data   : 'successor-reply',
                replyId: id
            }
        }, successor);

        await expect(pending).resolves.toBe('successor-reply');
        expect(worker.promises[id]).toBeUndefined()
    })
});
