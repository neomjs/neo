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
import '../../../../src/manager/Instance.mjs';

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

let appPrototype, vdomPrototype;

// Exercise App's real dispatch while retaining the isolated shared-worker port fixture.
const createAppWorker = portSpecs => {
    const worker = createSharedWorker(portSpecs);
    Object.setPrototypeOf(worker, appPrototype);
    worker.canvasGroups = {retirePort() {}, removeWindow() {}, windows: new Map()};
    return worker
};

test.describe('Worker reply loss on null port lookup (#12958)', () => {
    test.beforeAll(async () => {
        const original = globalThis.postMessage;
        globalThis.postMessage = () => {};
        try {
            delete Neo.worker.App;
            const {default: app}  = await import('../../../../src/worker/App.mjs');
            const {default: vdom} = await import('../../../../src/worker/VDom.mjs');
            appPrototype  = Object.getPrototypeOf(app);
            vdomPrototype = Object.getPrototypeOf(vdom)
        } finally {
            if (original === undefined) delete globalThis.postMessage;
            else globalThis.postMessage = original
        }
    });
    test('a destroyed target sends a cloneable rejection that settles the live caller', async () => {
        const {port, sent} = createCapturingPort(),
              server       = createSharedWorker([{appName: 'ReplyLossApp', id: 'port-cancel', port, windowId: 'win-cancel'}]),
              caller       = createSharedWorker([]),
              target       = Neo.create(core.Base), originalError = console.error,
              pending      = new Promise((resolve, reject) => {
                  caller.promises['q-cancel'] = {resolve, reject}
              }),
              outcome = pending.catch(error => error);

        port.postMessage = message => sent.push(structuredClone(message));
        target.waitForOwner = () => target.timeout(1000);
        const errors = [];
        console.error = (...args) => errors.push(args);

        try {
            await target.ready();
            expect(Neo.get(target.id)).toBe(target);
            server.onRemoteMethod({
                id      : 'q-cancel', origin: 'main', port: 'port-cancel', windowId: 'win-cancel',
                remoteId: target.id, remoteMethod: 'waitForOwner', data: []
            });
            target.destroy();
            await Promise.resolve();
            expect(sent).toHaveLength(1);
            expect(sent[0].reject).toBe(true);
            expect(sent[0].data).toBeInstanceOf(Error);
            caller.onMessage({data: sent[0]});
            expect((await outcome).message).toBe('Remote method target was destroyed');
            expect(caller.promises['q-cancel']).toBeUndefined();
            expect(errors).toEqual([[Neo.isDestroyed]])
        } finally {
            console.error = originalError;
            target.destroy();
            caller.destroy();
            server.destroy()
        }
    });

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

    test('a reply to a window whose port this worker retired is its departure, not a logged loss', () => {
        const
            captured  = createCapturingPort(),
            portEntry = {
                appNames: new Set(['DepartedApp']),
                id      : 'port-departed',
                port    : captured.port,
                windowId: 'win-departed'
            },
            worker        = createSharedWorker([portEntry]),
            errors        = [],
            originalError = console.error;

        Neo.ns('Test.Unit.Worker.ReplyLossRemote', true).answer = () => ({ok: true});
        worker.onDisconnect({appName: 'DepartedApp', windowId: 'win-departed'}, portEntry);
        console.error = (...args) => errors.push(args);

        try {
            // No source port: this is how an App request reaches the VDom worker, over their direct channel
            ['win-departed', 'win-unknown'].forEach((windowId, index) => worker.onMessage({data: {
                action         : 'remoteMethod',
                id             : `q-channel-${index}`,
                origin         : 'app',
                remoteClassName: 'Test.Unit.Worker.ReplyLossRemote',
                remoteMethod   : 'answer',
                windowId
            }}))
        } finally {
            console.error = originalError
        }

        expect(captured.sent, 'the departed window receives nothing').toHaveLength(0);
        expect(errors.map(([, context]) => context.windowId), 'a window this worker never knew still reads as a loss')
            .toEqual(['win-unknown'])
    });

    /**
     * Settles within a tick or reports that it did not, so an unsettled caller fails fast instead of hanging.
     * @param {Promise} promise
     * @returns {Promise<String>} 'resolved', the rejection's name, or 'pending'
     */
    const settlement = promise => Promise.race([
        promise.then(() => 'resolved', error => error?.name || 'rejected'),
        new Promise(resolve => setTimeout(() => resolve('pending'), 50))
    ]);

    /**
     * An App and a VDom worker sharing one window, joined by the direct channel the App uses for VDom
     * requests: a request over it carries no port entry, only the `windowId` of the window it renders for.
     * @param {String} windowId
     * @returns {Object}
     */
    const createChannelPair = windowId => {
        const
            appWindow  = createCapturingPort(),
            vdomWindow = createCapturingPort(),
            app        = createSharedWorker([{appNames: new Set(['ChannelApp']), id: `app-${windowId}`,  port: appWindow.port,  windowId}]),
            vdom       = createSharedWorker([{appNames: new Set(['ChannelApp']), id: `vdom-${windowId}`, port: vdomWindow.port, windowId}]),
            inFlight   = [];

        app.channelPorts.vdom = {postMessage: message => inFlight.push(message)};
        Neo.ns('Test.Unit.Worker.ChannelRemote', true).updateBatch = () => ({deltas: []});

        const pending = app.generateRemote({className: 'Test.Unit.Worker.ChannelRemote', origin: 'vdom'}, 'updateBatch')({
            appName: 'ChannelApp',
            updates: {},
            windowId
        });

        return {app, inFlight, pending, vdom, vdomWindow}
    };

    test('a channel request whose window disconnects settles its caller, and its reply is not reported as lost', async () => {
        const
            {app, inFlight, pending, vdom} = createChannelPair('win-channel'),
            [request]                      = inFlight,
            rejection                      = pending.catch(reason => reason),
            errors                         = [],
            originalError                  = console.error;

        expect(inFlight, 'the request left over the channel').toHaveLength(1);

        // The window closes while the request is in flight: both workers retire its port
        app .onDisconnect({appName: 'ChannelApp', windowId: 'win-channel'}, app.ports[0]);
        vdom.onDisconnect({appName: 'ChannelApp', windowId: 'win-channel'}, vdom.ports[0]);

        console.error = (...args) => errors.push(args);

        try {
            vdom.onMessage({data: request})
        } finally {
            console.error = originalError
        }

        expect(await settlement(pending), 'the caller is settled through the port-retirement contract').toBe('PortDisconnectedError');
        const reason = await rejection;
        expect(reason).toMatchObject({name: 'PortDisconnectedError', code: 'NEO_DEAD_PORT', windowId: 'win-channel'});
        expect(app.isDeparture(reason), 'the emitted channel rejection identifies its recorded departure').toBe(true);
        expect(app.promises[request.id], 'and its pending entry is gone').toBeUndefined();
        expect(errors, 'the reply its window can no longer receive is not reported as a loss').toEqual([])
    });

    test('a channel request whose window stays connected is still answered, whatever other windows do', async () => {
        const
            {app, inFlight, pending, vdom, vdomWindow} = createChannelPair('win-live'),
            [request]                                  = inFlight,
            other                                      = {appNames: new Set(['ChannelApp']), id: 'app-win-other', port: createCapturingPort().port, windowId: 'win-other'};

        app.ports.push(other);
        app.onDisconnect({appName: 'ChannelApp', windowId: 'win-other'}, other);

        expect(await settlement(pending), 'another window leaving does not settle this request').toBe('pending');

        vdom.onMessage({data: request});

        const [reply] = vdomWindow.sent;

        expect(reply?.replyId, 'the reply routes through the live window').toBe(request.id);

        app.onMessage({data: reply});

        expect(await settlement(pending)).toBe('resolved')
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

    for (const first of ['tree', 'dom']) {
        test(`a VDom update waits for both reply legs (${first} first)`, async () => {
            const captured = createCapturingPort(),
                  worker   = createAppWorker([{id: 'join-port', port: captured.port, windowId: 'join-window'}]);

            worker.channelPorts.vdom = captured.port;

            const pending = worker.promiseMessage('vdom', {
                action  : 'remoteMethod', remoteClassName: 'Neo.vdom.Helper', remoteMethod: 'updateBatch',
                windowId: 'join-window'
            });
            const [{id}]  = captured.sent;
            const tree    = {action: 'vdomTreeReply', replyId: id, domAckRequired: true, data: {vnode: {id: 'rendered'}}};
            const dom     = {action: 'reply', replyId: id, success: true};
            let   settled = false;

            pending.then(() => {settled = true});
            worker.onMessage({data: first === 'tree' ? tree : dom});
            await Promise.resolve();
            expect(settled, 'one leg alone cannot complete the update').toBe(false);
            worker.onMessage({data: first === 'tree' ? dom : tree});
            await expect(pending).resolves.toEqual(tree.data);
            expect(worker.promises[id]).toBeUndefined();
            worker.destroy()
        })
    }

    test('an update whose replies are both lost has a bounded wait', async () => {
        const captured    = createCapturingPort(), worker = createAppWorker([]),
              originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
        let timer;
        globalThis.setTimeout = callback => {timer = callback; return 123};
        globalThis.clearTimeout = () => {};
        try {
            worker.channelPorts.vdom = captured.port;
            const pending = worker.promiseMessage('vdom', {
                action: 'remoteMethod', remoteClassName: 'Neo.vdom.Helper', remoteMethod: 'updateBatch', windowId: 'join-window'
            });
            const [{id}] = captured.sent;
            expect(timer, 'a fully lost reply cannot strand the request').toEqual(expect.any(Function));
            timer();
            await expect(pending).rejects.toThrow();
            expect(worker.promises[id]).toBeUndefined()
        } finally {
            globalThis.setTimeout = originalSet;
            globalThis.clearTimeout = originalClear;
            worker.destroy()
        }
    });

    test('a VDom update without DOM work settles on its tree reply', async () => {
        const captured = createCapturingPort(), worker = createAppWorker([]);
        worker.channelPorts.vdom = captured.port;
        const pending = worker.promiseMessage('vdom', {
            action: 'remoteMethod', remoteClassName: 'Neo.vdom.Helper', remoteMethod: 'updateBatch', windowId: 'join-window'
        });
        const [{id}] = captured.sent, result = {vnode: {id: 'unchanged'}};
        worker.onMessage({data: {action: 'vdomTreeReply', replyId: id, domAckRequired: false, data: result}});
        await expect(pending).resolves.toEqual(result);
        expect(worker.promises[id]).toBeUndefined();
        worker.destroy()
    });

    test('a DOM apply failure rejects a VDom update even after its tree reply', async () => {
        const captured = createCapturingPort(), worker = createAppWorker([]);
        worker.channelPorts.vdom = captured.port;
        const pending = worker.promiseMessage('vdom', {
            action: 'remoteMethod', remoteClassName: 'Neo.vdom.Helper', remoteMethod: 'updateBatch', windowId: 'join-window'
        });
        const [{id}] = captured.sent, error = new Error('DOM apply failed');
        worker.onMessage({data: {action: 'vdomTreeReply', replyId: id, domAckRequired: true, data: {vnode: {}}}});
        worker.onMessage({data: {action: 'reply', replyId: id, reject: true, data: error}});
        await expect(pending).rejects.toThrow('DOM apply failed');
        expect(worker.promises[id]).toBeUndefined();
        worker.destroy()
    });

    test('ordinary VDom remote calls retain one-reply settlement', async () => {
        const captured = createCapturingPort(), worker = createAppWorker([]);
        worker.channelPorts.vdom = captured.port;
        const pending = worker.promiseMessage('vdom', {
            action: 'remoteMethod', remoteClassName: 'Neo.vdom.Helper', remoteMethod: 'create', windowId: 'join-window'
        });
        const [{id}] = captured.sent, result = {vnode: {id: 'created'}};
        worker.onMessage({data: {action: 'reply', replyId: id, data: result}});
        await expect(pending).resolves.toEqual(result);
        expect(worker.promises[id]).toBeUndefined();
        worker.destroy()
    });

    test('an update request that cannot be cloned rejects rather than parking a promise', async () => {
        const captured = createCapturingPort(), worker = createAppWorker([]);
        captured.port.postMessage = message => structuredClone(message);
        worker.channelPorts.vdom = captured.port;
        await expect(worker.promiseMessage('vdom', {
            action: 'remoteMethod', remoteClassName: 'Neo.vdom.Helper', remoteMethod: 'updateBatch',
            data  : () => {}, windowId: 'join-window'
        })).rejects.toMatchObject({name: 'DataCloneError'});
        expect(Object.keys(worker.promises)).toHaveLength(0);
        worker.destroy()
    });

    test('a window departure rejects an update waiting for its DOM acknowledgement', async () => {
        const captured = createCapturingPort(),
              entry    = {appNames: new Set(['JoinApp']), id: 'join-port', port: captured.port, windowId: 'join-window'},
              worker   = createAppWorker([entry]);
        worker.channelPorts.vdom = captured.port;
        const pending = worker.promiseMessage('vdom', {
            action: 'remoteMethod', remoteClassName: 'Neo.vdom.Helper', remoteMethod: 'updateBatch', windowId: 'join-window'
        });
        const [{id}] = captured.sent;
        worker.onMessage({data: {action: 'vdomTreeReply', replyId: id, domAckRequired: true, data: {vnode: {}}}});
        WorkerBase.prototype.onDisconnect.call(worker, {appName: 'JoinApp', windowId: 'join-window'}, entry);
        await expect(pending).rejects.toMatchObject({code: 'NEO_DEAD_PORT'});
        expect(worker.promises[id]).toBeUndefined();
        worker.destroy()
    });

    test('a metadata-only VDom update sends a tree and requires a Main acknowledgement', () => {
        const direct = createCapturingPort(), main = createCapturingPort(),
              worker = createSharedWorker([{id: 'main-port', port: main.port, windowId: 'join-window'}]);
        Object.setPrototypeOf(worker, vdomPrototype);
        worker.appChannelPort = direct.port;
        const data = {updateVdom: true, deltas: [], meta: {componentIds: ['one']}, vnode: {id: 'one'}};
        worker.resolve({id: 'metadata', origin: 'app', remoteClassName: 'Neo.vdom.Helper', remoteMethod: 'updateBatch', windowId: 'join-window'}, data);
        expect(direct.sent[0]).toMatchObject({action: 'vdomTreeReply', replyId: 'metadata', domAckRequired: true, data});
        expect(main.sent[0]).toMatchObject({action: 'updateVdom', id: 'metadata', origin: 'app', deltas: [], meta: data.meta});
        worker.destroy()
    });

    test('a VDom tree clone failure rejects App without sending the DOM write', () => {
        const direct = createCapturingPort(), main = createCapturingPort(),
              worker = createSharedWorker([{id: 'main-port', port: main.port, windowId: 'join-window'}]);
        Object.setPrototypeOf(worker, vdomPrototype);
        worker.appChannelPort = direct.port;
        worker.channelPorts.app = direct.port;
        direct.port.postMessage = message => direct.sent.push(structuredClone(message));
        worker.resolve({id: 'clone', origin: 'app', remoteClassName: 'Neo.vdom.Helper', remoteMethod: 'updateBatch', windowId: 'join-window'},
            {updateVdom: true, deltas: [{id: 'one'}], vnode: {bad: () => {}}});
        expect(main.sent).toHaveLength(0);
        expect(direct.sent[0]).toMatchObject({action: 'reply', replyId: 'clone', reject: true});
        worker.destroy()
    });

    test('a VDom helper failure reaches App after its target window has departed', () => {
        const direct = createCapturingPort(), worker = createSharedWorker([]), error = new Error('VDom failed');
        Object.setPrototypeOf(worker, vdomPrototype);
        worker.appChannelPort = direct.port;
        worker.departedWindowIds.add('gone');
        worker.reject({id: 'failed-update', origin: 'app', remoteClassName: 'Neo.vdom.Helper',
            remoteMethod: 'updateBatch', windowId: 'gone'}, error);
        expect(direct.sent[0]).toMatchObject({action: 'reply', replyId: 'failed-update', reject: true, data: error});
        worker.destroy()
    });

    test('a failed VDom channel rejects only its pending updates', async () => {
        const captured = createCapturingPort(), worker = createAppWorker([]);
        worker.channelPorts.vdom = captured.port;
        const pending = worker.promiseMessage('vdom', {
            action: 'remoteMethod', remoteClassName: 'Neo.vdom.Helper', remoteMethod: 'updateBatch', windowId: 'join-window'
        });
        const [{id}] = captured.sent;
        worker.onVdomWorkerFailed({windowId: 'other-window'});
        expect(worker.promises[id], 'another window failure leaves this flight live').toBeDefined();
        worker.onVdomWorkerFailed({windowId: 'join-window'});
        await expect(pending).rejects.toThrow('VDom channel failed');
        expect(worker.promises[id]).toBeUndefined();
        worker.destroy()
    });

    for (const first of ['tree', 'dom']) {
        test(`a lost ${first === 'tree' ? 'DOM acknowledgement' : 'tree'} times out after ${first} arrives`, async () => {
            const captured    = createCapturingPort(), worker = createAppWorker([]),
                  originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
            let timer;
            globalThis.setTimeout = callback => {timer = callback; return 123};
            globalThis.clearTimeout = () => {};
            try {
                worker.channelPorts.vdom = captured.port;
                const pending = worker.promiseMessage('vdom', {
                    action: 'remoteMethod', remoteClassName: 'Neo.vdom.Helper', remoteMethod: 'updateBatch', windowId: 'join-window'
                });
                const [{id}] = captured.sent;
                worker.onMessage({data: first === 'tree' ?
                    {action: 'vdomTreeReply', replyId: id, domAckRequired: true, data: {vnode: {}}} :
                    {action: 'reply', replyId: id, success: true}});
                expect(timer, 'the remaining leg has a bounded wait').toEqual(expect.any(Function));
                timer();
                await expect(pending).rejects.toThrow();
                expect(worker.promises[id]).toBeUndefined()
            } finally {
                globalThis.setTimeout = originalSet;
                globalThis.clearTimeout = originalClear;
                worker.destroy()
            }
        })
    }

    test('a registered VDom port acknowledges readiness and rejects its flights on messageerror', async () => {
        const captured = createCapturingPort(), worker = createAppWorker([]), listeners = {};
        captured.port.addEventListener = (name, listener) => {listeners[name] = listener};
        worker.onRegisterPort({origin: 'vdom', transfer: captured.port});
        expect(captured.sent.shift()).toEqual({action: 'vdomChannelReady'});
        captured.port.onmessage({data: {action: 'vdomChannelActive'}});
        expect(captured.sent.shift()).toEqual({action: 'vdomChannelRegistered'});
        const pending = worker.promiseMessage('vdom', {
            action: 'remoteMethod', remoteClassName: 'Neo.vdom.Helper', remoteMethod: 'updateBatch', windowId: 'join-window'
        });
        captured.port.onmessageerror();
        await expect(pending).rejects.toThrow('VDom channel failed');
        expect(listeners.close).toEqual(expect.any(Function));
        worker.destroy()
    });

    test('a VDom channel transfer retries through a surviving window when its owner departs early', () => {
        const first       = createCapturingPort(), second = createCapturingPort(),
              firstEntry  = {id: 'port-first', port: first.port, windowId: 'first'},
              secondEntry = {id: 'port-second', port: second.port, windowId: 'second'},
              worker      = createSharedWorker([firstEntry, secondEntry]);
        Object.setPrototypeOf(worker, vdomPrototype);
        worker.connectAppChannel(firstEntry);
        const initial = worker.appChannelPort;
        expect(first.sent[0]).toMatchObject({action: 'registerPort', port: 'port-first'});
        worker.removePort(firstEntry);
        expect(worker.appChannelPort).not.toBe(initial);
        expect(second.sent[0]).toMatchObject({action: 'registerPort', port: 'port-second'});
        worker.appChannelPort.close();
        first.sent[0].transfer.close();
        second.sent[0].transfer.close();
        worker.destroy()
    });

    test('a stale registration arriving after its replacement cannot displace the active VDom channel', async () => {
        const first       = createCapturingPort(), second = createCapturingPort(),
              firstEntry  = {id: 'port-first', port: first.port, windowId: 'first'},
              secondEntry = {id: 'port-second', port: second.port, windowId: 'second'},
              vdom        = createSharedWorker([firstEntry, secondEntry]), app = createAppWorker([]);
        Object.setPrototypeOf(vdom, vdomPrototype);
        vdom.connectAppChannel(firstEntry);
        const stale = first.sent[0].transfer;
        vdom.removePort(firstEntry);
        const current = second.sent[0].transfer;
        app.onRegisterPort({origin: 'vdom', transfer: current});
        await expect.poll(() => app.channelPorts.vdom).toBe(current);
        app.onRegisterPort({origin: 'vdom', transfer: stale});
        await new Promise(resolve => setImmediate(resolve));
        expect(app.channelPorts.vdom, 'a stale candidate cannot take the confirmed channel').toBe(current);
        vdom.appChannelPort.close();
        current.close();
        stale.close();
        await new Promise(resolve => setImmediate(resolve));
        vdom.destroy();
        app.destroy()
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

        expect(worker.ports).toHaveLength(0);
        expect(worker.departedWindowIds.size, 'the departed-window record keeps the newest 16 and no more').toBe(16);
        expect(worker.departedWindowIds.has('win-999') && !worker.departedWindowIds.has('win-0'), 'the oldest is the one evicted').toBe(true)
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
            pending = worker.promiseMessage('win-pending', {action: 'pendingReply'}),
            rejection = pending.catch(reason => reason);

        const [{id}] = captured.sent;

        worker.onDisconnect({
            appName : 'PendingApp',
            windowId: 'win-pending'
        }, portEntry);

        await expect(pending).rejects.toThrow('Worker port disconnected before reply: port-pending');
        const reason = await rejection;
        expect(reason).toMatchObject({name: 'PortDisconnectedError', code: 'NEO_DEAD_PORT', windowId: 'win-pending'});
        expect(worker.isDeparture(reason), 'no caller-supplied window is needed to classify the emitted reason').toBe(true);
        expect(worker.promises[id]).toBeUndefined()
    });

    test('an in-flight non-window port failure remains a rejection without departure evidence', async () => {
        const captured = createCapturingPort(),
              entry    = {appNames: new Set(), id: 'backend-port', port: captured.port, windowId: null},
              worker   = createSharedWorker([entry]),
              pending  = worker.promiseMessage('backend-port', {action: 'pendingReply'}).catch(reason => reason),
              [{id}]   = captured.sent;
        expect(worker.removePort(entry)).toBe(true);
        const reason = await pending;
        expect(reason).toMatchObject({name: 'PortDisconnectedError', windowId: null});
        expect(reason.message).toBe('Worker port disconnected before reply: backend-port');
        expect(worker.isDeparture(reason)).toBe(false);
        expect(worker.departedWindowIds.size).toBe(0);
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
        worker.onMessage({data: {action: 'reply', data: 'stale-reply', replyId: id}}, oldEntry);
        expect(worker.promises[id], 'the retired entry cannot settle the successor request').toBeDefined();
        expect(successorPort.state.closed).toBe(false);

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
