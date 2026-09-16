import {setup} from '../../setup.mjs';

const appName = 'PromiseSettleTimingTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false, // Required: Neo.vdom.Helper runs locally
        logVdomUpdateCollisions: false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs'; // side effect: registers Neo.vdom.Helper, which runs locally here

class SettleChild extends Component {
    static config = {
        className: 'Test.SettleChild',
        ntype    : 'test-settle-child',
        _vdom    : {tag: 'div', cls: ['settle-child']}
    }
}
SettleChild = Neo.setupClass(SettleChild);

class SettleContainer extends Container {
    static config = {
        className: 'Test.SettleContainer',
        items    : []
    }
}
SettleContainer = Neo.setupClass(SettleContainer);

/**
 * @summary What a `promiseUpdate()` promises about the DOM when it settles.
 *
 * A flight yields a macrotask and then collects its payload, so a change made after that point belongs to the
 * next flight — and so does the promise asked for it. Settling such a promise with the flight already in the air
 * hands the caller a tree that does not carry its change: a caller that focuses what it just rendered reaches a
 * node the DOM does not hold yet.
 *
 * The arms read the component's `vnode` at settle time, because that is what every consumer reads next.
 */
test.describe('Neo.mixin.VdomLifecycle promiseUpdate settle timing', () => {
    let counter = 0,
        created = [];

    const originalUpdateBatch = VdomHelper.updateBatch;

    const uniqueId = prefix => `${prefix}-${Date.now()}-${counter++}`;

    /**
     * @returns {Promise<Neo.component.Base>} a mounted child with a settled first vnode
     */
    async function createChild() {
        const containerId = uniqueId('settle-container'),
              childId     = uniqueId('settle-child');

        created.push(containerId);

        const container = Neo.create(SettleContainer, {
            appName,
            id   : containerId,
            items: [{module: SettleChild, id: childId, text: 'pristine'}]
        });

        await container.initVnode(true);
        container.mounted = true;

        await container.promiseUpdate();

        return container.items[0]
    }

    /**
     * @param {Neo.component.Base} component
     * @returns {String} the text the last landed render put into the tree
     */
    function renderedText(component) {
        const {vnode} = component;

        return vnode?.textContent ?? vnode?.childNodes?.[0]?.textContent
    }

    test.afterEach(() => {
        VdomHelper.updateBatch = originalUpdateBatch;

        created.forEach(id => Neo.getComponent(id)?.destroy());
        created = []
    });

    test('a promise asked for after the flight collected its payload settles with its own change rendered', async () => {
        const child    = await createChild(),
              inFlight = [];

        // Holds a flight open between its payload collection — `updateBatch` runs on the collected payload — and its
        // landing. That window is the whole subject: a change made inside it belongs to the NEXT flight.
        VdomHelper.updateBatch = (...args) => {
            const result = originalUpdateBatch.apply(VdomHelper, args);

            return new Promise(resolve => inFlight.push(() => resolve(result)))
        };

        child.text = 'first';
        child.update();

        await expect.poll(() => inFlight.length, {message: 'the first flight collected its payload'}).toBe(1);

        child.text = 'second';

        const promise = child.promiseUpdate();

        inFlight.shift()();

        // The second flight runs on the restored helper, so releasing the first is all this arm has to do
        VdomHelper.updateBatch = originalUpdateBatch;

        await promise;

        expect(renderedText(child), 'the render carrying `second` had landed when its promise settled').toBe('second')
    });

    test('CONTROL: a promise asked for before the payload is collected still settles with the flight in the air', async () => {
        const child = await createChild();

        child.text = 'first';
        child.update();

        // Same tick: the flight has not yielded yet, so this change belongs to it
        child.text = 'second';

        await child.promiseUpdate();

        expect(renderedText(child), 'one flight carried both changes').toBe('second')
    });

    /**
     * Holds the next flight open between payload collection and landing, and returns the release for it.
     * @returns {Function[]} the queue a test shifts releases from
     */
    function holdFlights() {
        const inFlight = [];

        VdomHelper.updateBatch = (...args) => {
            const result = originalUpdateBatch.apply(VdomHelper, args);

            return new Promise((resolve, reject) => inFlight.push({resolve: () => resolve(result), reject}))
        };

        return inFlight
    }

    test('a component destroyed while its flight is in the air settles every parked promise, claimed or not', async () => {
        const child    = await createChild(),
              inFlight = holdFlights();

        child.text = 'first';

        const claimed = child.promiseUpdate().then(() => 'resolved', reason => reason);

        await expect.poll(() => inFlight.length, {message: 'the flight collected its payload'}).toBe(1);

        child.text = 'second';

        const later = child.promiseUpdate().then(() => 'resolved', reason => reason);

        child.destroy();

        expect(await claimed, 'the claimed promise settles with the destroy').toBe(Neo.isDestroyed);
        expect(await later, 'so does the one that arrived after the claim').toBe(Neo.isDestroyed)
    });

    test('a flight that fails after its claim leaves no promise stranded', async () => {
        const child    = await createChild(),
              inFlight = holdFlights();

        child.text = 'first';

        const claimed = child.promiseUpdate().then(() => 'resolved', () => 'rejected');

        await expect.poll(() => inFlight.length, {message: 'the flight collected its payload'}).toBe(1);

        child.text = 'second';

        const later = child.promiseUpdate().then(() => 'resolved', () => 'rejected');

        VdomHelper.updateBatch = originalUpdateBatch;
        inFlight.shift().reject({data: {error: 'test-injected apply failure'}});

        expect(await claimed, 'the claimed promise rejects with its flight').toBe('rejected');
        expect(['resolved', 'rejected'], 'the later one settles one way or the other').toContain(await later)
    });

    test('a promise merged into a container that has not rendered yet settles when its first render mounts the child', async () => {
        const containerId = uniqueId('settle-container'),
              childId     = uniqueId('settle-child');

        created.push(containerId);

        const container = Neo.create(SettleContainer, {
            appName,
            id   : containerId,
            items: [{module: SettleChild, id: childId, text: 'pristine'}]
        });

        const child = container.items[0];

        // Not rendered yet, so the container parks this update, and the child's update merges into it
        container.update();
        child.text = 'first';

        let outcome = 'still parked';

        child.promiseUpdate().then(() => {outcome = 'resolved'}, reason => {outcome = reason});

        expect(Neo.manager.VDomUpdate.getMergedChildIds(containerId)?.has(childId), 'the promise rides a merge, not a flight of its own').toBe(true);

        // The first render expands the whole tree and clears the pending update, so no flight ever collects the merge
        await container.initVnode(true);
        container.mounted = true;

        await expect.poll(() => outcome, {message: 'the render that mounted the child is the one this promise waited for'}).toBe('resolved')
    });

    test('CONTROL: an idle component still settles its own first flight', async () => {
        const child = await createChild();

        child.text = 'only';

        await child.promiseUpdate();

        expect(renderedText(child), 'nothing was in the air to settle against').toBe('only')
    })
});
