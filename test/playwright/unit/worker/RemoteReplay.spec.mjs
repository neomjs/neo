import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'RemoteReplayTest'
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import RemoteMethodAccess from '../../../../src/worker/mixin/RemoteMethodAccess.mjs';
import WorkerBase         from '../../../../src/worker/Base.mjs';

/**
 * @summary A window connecting to a running SharedWorker receives the worker's remote methods.
 *
 * Every singleton's `registerRemote` is stored on the worker and replayed to each newly connected
 * port, so a second window — or the first window after a reload — gets the same proxies the first
 * window got through the startup path. Two contracts make that replay land:
 *
 * 1. The replayed message is addressed to `main` and routed to exactly the new port. The receiving
 *    thread accepts a registration only when its destination names that thread, so a message whose
 *    destination is the port id is delivered and dropped — the window ends up with no proxies and no
 *    error. Routing through `opts.port` keeps the message out of every other window's port.
 * 2. Receiving the same registration twice is a no-op. The first window can legitimately see a
 *    registration through the replay and again through the singleton's own startup registration;
 *    the existing proxy is kept, never re-minted, never reported as a conflict.
 */
class ReplayWorker extends WorkerBase {
    static config = {
        className: 'Test.Unit.Worker.RemoteReplayWorker'
    }

    construct(config) {
        super.construct(config);
        // The SharedWorker branch, decided before onConstructed() runs, so the dedicated-worker
        // announcement (which needs a main thread) never fires inside the single-threaded unit env.
        this.isSharedWorker = true
    }
}
Neo.setupClass(ReplayWorker);

class ReplayReceiver extends Neo.core.Base {
    static config = {
        className: 'Test.Unit.Worker.RemoteReplayReceiver',
        mixins   : [RemoteMethodAccess]
    }

    /**
     * Every reply the mixin's `resolve()` hands to `sendMessage()`, captured instead of posted.
     * @member {Object[]} replies=[]
     */
    replies = []

    promiseMessage(destination, opts) {
        return Promise.resolve(opts)
    }

    sendMessage(destination, opts) {
        this.replies.push(opts);
        return opts
    }
}
Neo.setupClass(ReplayReceiver);

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

const createWorker = () => Neo.create(ReplayWorker, {workerId: 'remote-replay-test'});

test.describe('SharedWorker remote registration replay', () => {
    test('onConnected: the replayed registerRemote is addressed to main and routed to the new port', () => {
        const worker       = createWorker(),
              {port, sent} = createCapturingPort();

        worker.remotesToRegister.push({className: 'Test.Unit.Worker.ReplayedSingleton', methods: ['ping', 'pong']});

        worker.onConnected({ports: [port]});

        const registration = sent.find(message => message.action === 'registerRemote'),
              newPortId    = worker.ports[worker.ports.length - 1].id;

        expect(sent.map(message => message.action)).toEqual(['workerConstructed', 'registerRemote']);
        expect(registration.destination).toBe('main');
        expect(registration.port).toBe(newPortId);
        expect(registration.className).toBe('Test.Unit.Worker.ReplayedSingleton');
        expect(registration.methods).toEqual(['ping', 'pong'])
    });

    test('onConnected: an already-connected window receives nothing from the replay', () => {
        const worker = createWorker(),
              first  = createCapturingPort(),
              second = createCapturingPort();

        worker.ports.push({appNames: new Set(['RemoteReplayTest']), id: 'port-first', port: first.port, windowId: 'win-first'});
        worker.remotesToRegister.push({className: 'Test.Unit.Worker.ReplayedSingleton', methods: ['ping']});

        worker.onConnected({ports: [second.port]});

        expect(first.sent.length).toBe(0);
        expect(second.sent.filter(message => message.action === 'registerRemote').length).toBe(1)
    });

    test('onRegisterRemote: the same endpoint arriving twice keeps the existing proxy, still replies, and still routes to its origin', async () => {
        const receiver  = Neo.create(ReplayReceiver),
              className = 'Test.Unit.Worker.TwiceRegistered',
              remote    = {className, destination: Neo.workerId, methods: ['ping'], origin: 'app'};

        receiver.onRegisterRemote({...remote, id: 'registration-1'});

        const proxy = Neo.ns(className).ping;

        expect(typeof proxy).toBe('function');

        expect(() => receiver.onRegisterRemote({...remote, id: 'registration-2'})).not.toThrow();

        expect(Neo.ns(className).ping).toBe(proxy);
        expect(receiver.replies.map(reply => reply.replyId)).toEqual(['registration-1', 'registration-2']);

        // the retained proxy still addresses the origin that registered it
        expect((await proxy({})).destination).toBe('app')
    });

    test('onRegisterRemote: the same method from a DIFFERENT origin is a collision — it throws and the first binding stays', async () => {
        const receiver  = Neo.create(ReplayReceiver),
              className = 'Test.Unit.Worker.ConflictingOrigins',
              methods   = ['ping'];

        receiver.onRegisterRemote({className, destination: Neo.workerId, methods, origin: 'app'});

        const proxy = Neo.ns(className).ping;

        expect(() => receiver.onRegisterRemote({className, destination: Neo.workerId, methods, origin: 'data'}))
            .toThrow(/collision/);

        expect(Neo.ns(className).ping).toBe(proxy);
        expect((await proxy({})).destination).toBe('app')
    });

    test('onRegisterRemote: a namespace slot already holding a local member is a collision, and the local member stays', () => {
        const receiver  = Neo.create(ReplayReceiver),
              className = 'Test.Unit.Worker.LocallyBound',
              local     = () => 'local';

        Neo.ns(className, true).ping = local;

        expect(() => receiver.onRegisterRemote({className, destination: Neo.workerId, methods: ['ping'], origin: 'app'}))
            .toThrow(/collision/);

        expect(Neo.ns(className).ping).toBe(local)
    })
});
