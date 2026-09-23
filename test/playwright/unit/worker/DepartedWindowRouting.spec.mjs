import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkerDepartedWindowRoutingTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import WorkerBase     from '../../../../src/worker/Base.mjs';

/**
 * A SharedWorker resolves a message's port through a cascade that ends at `opts.appName`, so a stale port can still
 * reach its re-registered window. A window that DEPARTED re-registers nowhere, and the app's other port is a sibling
 * window: delivering there hands that main thread a window id it relays as a worker name, which surfaces as
 * `Target worker '<windowId>' does not exist` blamed on the wrong window. These arms fix where each shape lands.
 */
test.describe('Neo.worker.Base#sendMessage — a departed window is not a sibling', () => {
    let worker = null;

    /**
     * @summary A SharedWorker stub carrying the port bookkeeping the cascade reads.
     * @returns {Object}
     */
    function create() {
        const instance = Object.create(WorkerBase.prototype);

        Object.assign(instance, {
            channelPorts     : {},
            departedWindowIds: new Set(),
            isSharedWorker   : true,
            ports            : [],
            promises         : {}
        });

        return instance
    }

    /**
     * @summary Registers a window port of `appName` that records what it is sent.
     * @param {String} windowId
     * @param {String} [appName='App']
     * @returns {Object} the port entry, with `posted`
     */
    function addPort(windowId, appName='App') {
        const posted = [],
              entry  = {appNames: new Set([appName]), id: windowId, port: {close() {}, onmessage: null, postMessage: message => posted.push(message)}, posted, windowId};

        worker.ports.push(entry);

        return entry
    }

    /**
     * @param {String} windowId
     * @returns {Object} a remote call addressed to `windowId`, as `generateRemote` builds one
     */
    const remoteCall = windowId => ({action: 'remoteMethod', appName: 'App', remoteClassName: 'Neo.main.addon.ScrollSync', remoteMethod: 'unregister', windowId});

    test.beforeEach(() => {
        worker = create()
    });

    test('a message for a departed window reaches no sibling, and its promise rejects as a dead port', async () => {
        const departed = addPort('win-a'),
              sibling  = addPort('win-b');

        worker.removePort(departed);

        expect(worker.sendMessage('win-a', remoteCall('win-a'))).toBeUndefined();
        expect(sibling.posted, 'the sibling window must not receive the departed window\'s message').toHaveLength(0);

        await expect(worker.promiseMessage('win-a', remoteCall('win-a'))).rejects.toMatchObject({code: 'NEO_DEAD_PORT'});
        expect(sibling.posted).toHaveLength(0)
    });

    test('control: a window that never departed still falls back to its app\'s port', () => {
        const other = addPort('win-b');

        // No port for `win-c` and no departure on record: the reply-after-reconnect case the cascade exists for.
        expect(worker.sendMessage('win-c', remoteCall('win-c'))).toBeTruthy();
        expect(other.posted).toHaveLength(1)
    });

    test('control: a live window receives its own message and no other', () => {
        const target = addPort('win-a'),
              other  = addPort('win-b');

        worker.sendMessage('win-a', remoteCall('win-a'));

        expect(target.posted).toHaveLength(1);
        expect(other.posted).toHaveLength(0)
    });
});
