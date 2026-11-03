/**
 * @file test/playwright/unit/component/DepartedFirstRender.spec.mjs
 * @summary Pins what `initVnode()` reports when the window it renders for departs while the render is in flight.
 *
 * A vessel window can retire mid-drag while its viewport's first render is on the wire. Its App worker then
 * rejects that render as the window's departure, in one of two shapes: the window's port retiring under the
 * pending request (`worker.Base#removePort`), or a sibling window refusing the reply a worker relayed to it once
 * the window was gone (`worker.Manager#refuseForeignDomUpdate`). Both are the departure, not a defect, and the
 * caller still receives the rejection. A refusal for a window that never departed is a misroute and stays loud.
 *
 * The request is the real `Neo.vdom.Helper.create` proxy (`generateRemote`) on a SharedWorker carrying the real
 * port bookkeeping, so the port retirement, the departure record and the reply handling are the engine's own; the
 * arm plays the refusing main thread. Without a VDom channel the request itself takes the app's port cascade, which
 * in production the VDom worker's reply takes (`worker/DepartedWindowRouting.spec.mjs`): the App worker receives
 * the same refusal either way.
 * The browser witness is `e2e/workstation/VesselClosesMidFirstRenderNL.spec.mjs`.
 */

import {setup} from '../../setup.mjs';

const appName = 'DepartedFirstRenderTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useVdomWorker          : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import WorkerBase     from '../../../../src/worker/Base.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

test.describe('VdomLifecycle#initVnode: a first render whose window departed in flight', () => {
    let consoleError, create, errors, instances, isDeparture, worker;

    /**
     * @summary A SharedWorker with the port bookkeeping `sendMessage`, `removePort` and `isDeparture` read.
     * @returns {Object}
     */
    function createWorker() {
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
     * @summary Registers a window port of this app that records what it is sent.
     * @param {String} windowId
     * @returns {Object} the port entry, with `posted`
     */
    function addPort(windowId) {
        const posted = [],
              entry  = {appNames: new Set([appName]), id: 'port-' + windowId, port: {close() {}, onmessage: null, postMessage: message => posted.push(message)}, posted, windowId};

        worker.ports.push(entry);

        return entry
    }

    /**
     * @summary Answers the request a window received as `Manager#refuseForeignDomUpdate` does: a DOM update for
     * another window is rejected as a departed port, naming the window it belongs to.
     * @param {Object} entry The port of the window that received the request
     * @param {String} windowId The window the request renders for
     */
    function refuse(entry, windowId) {
        const {id} = entry.posted.at(-1);

        worker.onMessage({data: {action: 'reply', reject: true, replyId: id, data: {
            code   : 'NEO_DEAD_PORT',
            message: `A DOM update for window ${windowId} reached window ${entry.windowId}`,
            name   : 'PortDisconnectedError',
            windowId
        }}}, entry)
    }

    const render = windowId => {
        const component = Neo.create(Component, {appName, parentId: 'document.body', windowId});

        instances.push(component);

        return component.initVnode(true)
    };

    const initVnodeErrors = () => errors.filter(([label]) => label === 'initVnode error');

    test.beforeEach(() => {
        consoleError = console.error;
        create       = VdomHelper.create;
        errors       = [];
        instances    = [];
        isDeparture  = Neo.currentWorker.isDeparture;
        worker       = createWorker();

        console.error                 = (...args) => errors.push(args);
        Neo.currentWorker.isDeparture = (reason, windowId) => worker.isDeparture(reason, windowId);
        VdomHelper.create             = worker.generateRemote({className: 'Neo.vdom.Helper', origin: 'vdom'}, 'create')
    });

    test.afterEach(() => {
        console.error                 = consoleError;
        Neo.currentWorker.isDeparture = isDeparture;
        VdomHelper.create             = create;
        instances.forEach(instance => !instance.isDestroyed && instance.destroy())
    });

    test('the window\'s port retiring under the pending render rejects it without a worker error', async () => {
        const vessel = addPort('win-vessel');

        addPort('win-main');

        const flight = render('win-vessel');

        expect(vessel.posted, 'the render travels through its own window').toHaveLength(1);

        worker.removePort(vessel);

        await expect(flight).rejects.toMatchObject({code: 'NEO_DEAD_PORT', name: 'PortDisconnectedError', windowId: 'win-vessel'});
        expect(initVnodeErrors()).toEqual([])
    });

    test('a sibling refusing the render relayed after the window left rejects it without a worker error', async () => {
        const vessel = addPort('win-vessel'),
              main   = addPort('win-main');

        worker.removePort(vessel);

        const flight = render('win-vessel');

        expect(main.posted, 'with its window gone, the render falls back to the app\'s other window').toHaveLength(1);

        refuse(main, 'win-vessel');

        await expect(flight).rejects.toMatchObject({code: 'NEO_DEAD_PORT', windowId: 'win-vessel'});
        expect(initVnodeErrors()).toEqual([])
    });

    test('control: a refusal for a window that never departed is a misroute and stays loud', async () => {
        const main = addPort('win-main');

        // No port and no departure on record: the window was never there, so nothing excuses the misroute
        const flight = render('win-ghost');

        refuse(main, 'win-ghost');

        await expect(flight).rejects.toMatchObject({code: 'NEO_DEAD_PORT', windowId: 'win-ghost'});
        expect(initVnodeErrors()).toHaveLength(1)
    });

    test('control: a render that fails for any other reason stays loud', async () => {
        const vessel = addPort('win-vessel');

        const flight = render('win-vessel');

        worker.onMessage({data: {action: 'reply', reject: true, replyId: vessel.posted.at(-1).id, data: {message: 'the VDom worker failed'}}}, vessel);

        await expect(flight).rejects.toMatchObject({message: 'the VDom worker failed'});
        expect(initVnodeErrors()).toHaveLength(1)
    })
});
