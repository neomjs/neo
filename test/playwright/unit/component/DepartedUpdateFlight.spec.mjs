/**
 * @file test/playwright/unit/component/DepartedUpdateFlight.spec.mjs
 * @summary Pins what an update flight on the two-thread line reports when the window it renders for has departed.
 *
 * With `useVdomWorker: false` the App worker sends each flight's deltas itself (`Neo.applyDeltas`). A vessel window
 * that retires mid-drag removes its port, and the worker reaps its tree a task later, so a flight collected in between
 * still targets the departed window. Its send rejects as that window's departure in one of two shapes: no live port at
 * send time (`worker.Base#promiseMessage`), or the port retiring under the pending send (`worker.Base#removePort`).
 * Both are teardown, not a failed update. A dead port for a window that never departed, and any other send failure,
 * stay loud.
 *
 * The send is the real `promiseMessage` on a SharedWorker carrying the real port bookkeeping, so the port retirement,
 * the departure record and both rejection shapes are the engine's own. Updates run through `update()`, not
 * `promiseUpdate()`: parked promise callbacks receive the rejection and silence the log for their own reason.
 * The browser witness is `e2e/workstation/WorkstationFiveBeatNL.spec.mjs` scene 2 under `useVdomWorker: false`.
 */

import {setup} from '../../setup.mjs';

const appName = 'DepartedUpdateFlightTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import VDomUpdate     from '../../../../src/manager/VDomUpdate.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import WorkerBase     from '../../../../src/worker/Base.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test.describe('VdomLifecycle#executeVdomUpdate: an update flight whose window departed', () => {
    let applyDeltas, consoleError, errors, instances, isDeparture, worker;

    /**
     * @summary A SharedWorker with the port bookkeeping `promiseMessage`, `removePort` and `isDeparture` read.
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
     * @summary Mounts a component for `windowId`, then sends its later deltas through the worker's real
     * `promiseMessage`, as `App#applyDeltas` does.
     * @param {String} windowId
     * @returns {Promise<Neo.component.Base>}
     */
    async function mount(windowId) {
        const component = Neo.create(Component, {appName, parentId: 'document.body', text: 'before', windowId});

        instances.push(component);
        await component.initVnode(true);

        Neo.applyDeltas = (target, deltas) => worker.promiseMessage(target, {action: 'updateVdom', deltas});

        return component
    }

    /**
     * @summary Waits until a condition holds, a task at a time.
     * @param {Function} condition
     */
    async function until(condition) {
        for (let i = 0; i < 100 && !condition(); i++) {
            await tick()
        }
    }

    /**
     * @summary Starts a real update of the mounted component and waits for its flight to settle.
     * @param {Neo.component.Base} component
     */
    async function updateAndSettle(component) {
        component.text = 'after';
        await until(() => component.isVdomUpdating);
        await until(() => !component.isVdomUpdating && !VDomUpdate.inFlightUpdateMap.has(component.id))
    }

    const updateErrors = () => errors.filter(([label]) => label === 'vdom update failed');

    test.beforeEach(() => {
        applyDeltas  = Neo.applyDeltas;
        consoleError = console.error;
        errors       = [];
        instances    = [];
        isDeparture  = Neo.currentWorker.isDeparture;
        worker       = createWorker();

        console.error                 = (...args) => errors.push(args);
        Neo.applyDeltas               = async () => {};
        Neo.currentWorker.isDeparture = (reason, windowId) => worker.isDeparture(reason, windowId)
    });

    test.afterEach(() => {
        // The mount stub first, so a teardown's removeNode never reaches the departed window
        Neo.applyDeltas = async () => {};
        instances.forEach(instance => !instance.isDestroyed && instance.destroy());

        Neo.applyDeltas               = applyDeltas;
        Neo.currentWorker.isDeparture = isDeparture;
        console.error                 = consoleError
    });

    test('a send that finds the departed window\'s port gone settles the flight without a worker error', async () => {
        const vessel    = addPort('win-vessel'),
              component = await mount('win-vessel');

        worker.removePort(vessel);
        await updateAndSettle(component);

        expect(updateErrors()).toEqual([]);
        expect(VDomUpdate.inFlightUpdateMap.has(component.id), 'the flight released its in-flight state').toBe(false)
    });

    test('the window\'s port retiring under the pending send settles the flight without a worker error', async () => {
        const vessel    = addPort('win-vessel'),
              component = await mount('win-vessel');

        component.text = 'after';
        await until(() => vessel.posted.length > 0);

        expect(vessel.posted, 'the update travels through its own window').toHaveLength(1);

        worker.removePort(vessel);
        await until(() => !component.isVdomUpdating && !VDomUpdate.inFlightUpdateMap.has(component.id));

        expect(updateErrors()).toEqual([])
    });

    test('control: a dead port for a window that never departed is a misroute and stays loud', async () => {
        // No port and no departure on record: the window was never there, so nothing excuses the send
        const component = await mount('win-ghost');

        await updateAndSettle(component);

        expect(updateErrors()).toHaveLength(1)
    });

    test('control: a send that fails for any other reason stays loud', async () => {
        addPort('win-vessel');

        const component = await mount('win-vessel');

        Neo.applyDeltas = async () => {
            throw new Error('the main thread failed')
        };

        await updateAndSettle(component);

        expect(updateErrors()).toHaveLength(1)
    })
});
