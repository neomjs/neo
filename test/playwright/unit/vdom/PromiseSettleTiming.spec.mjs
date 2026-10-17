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
import VDomUpdate     from '../../../../src/manager/VDomUpdate.mjs';
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

    test('a flight that fails after its claim rejects every parked promise, the later one included', async () => {
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
        expect(await later, 'so does the one asked for after the claim, though that flight did not carry its change').toBe('rejected')
    });

    test('a promise asked for after the mounting render collected still settles AT the mount', async () => {
        const containerId = uniqueId('settle-container'),
              childId     = uniqueId('settle-child');

        created.push(containerId);

        const container = Neo.create(SettleContainer, {
            appName,
            id   : containerId,
            items: [{module: SettleChild, id: childId, text: 'pristine'}]
        });

        const child = container.items[0];

        // `initVnode` collects the whole tree synchronously, so this change is made after the render
        // that mounts the child has already taken its payload.
        const init = container.initVnode(true);

        child.text = 'late';

        let settledReading = 'still parked';

        child.promiseUpdate().then(() => {settledReading = renderedText(child)}, reason => {settledReading = `rejected: ${reason}`});

        await init;
        container.mounted = true;

        await expect.poll(() => settledReading, {message: 'the promise settled'}).not.toBe('still parked');

        // DELIBERATE, and the one documented exception to the settle-timing guarantee: a mount claims
        // and settles everything parked on the component, so this reads the tree the mounting render
        // carried rather than the one carrying `late`. A caller depends on it — `dashboard/dock/Workspace`
        // awaits an UNMOUNTED host's `promiseUpdate()` purely to learn that it mounted, under an explicit
        // `if (!host.mounted)`. That is the only such site: every other `host.promiseUpdate()` in the dock
        // follows a `host.update()` on a host already mounted, which is an ordinary render settle.
        // Removing the mount's claim was proposed, implemented two different ways, and rejected; both
        // ways turn this reading into `late`.
        //
        // Assert the READING, never merely that it settled: a drained follow-up cycle settles it either
        // way, about 100ms later, so a settles-eventually arm passes with the claim removed and guards
        // nothing.
        expect(settledReading, 'the mount settled it, so the caller reads the tree that render carried').toBe('pristine')
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

    test('a promise parked before a component renders for the first time settles with that render, mounted or not', async () => {
        const containerId = uniqueId('settle-container');

        created.push(containerId);

        const container = Neo.create(SettleContainer, {
            appName,
            id   : containerId,
            items: [{module: SettleChild, id: uniqueId('settle-child'), text: 'pristine'}]
        });

        let outcome = 'still parked';

        // Not rendered yet, so the request parks until the first render collects it
        container.promiseUpdate().then(() => {outcome = 'resolved'}, reason => {outcome = reason});

        await container.initVnode(false);

        expect(container.mounted, 'nothing mounts, so the render itself is the only settle').toBe(false);

        await expect.poll(() => outcome, {message: 'the first render carried what was parked before it collected'}).toBe('resolved')
    });

    test('CONTROL: an idle component still settles its own first flight', async () => {
        const child = await createChild();

        child.text = 'only';

        await child.promiseUpdate();

        expect(renderedText(child), 'nothing was in the air to settle against').toBe('only')
    })
});

/** @summary Callback failures drain the collected work while reentrant requests keep their own membership. */
test.describe('VDomUpdate callback settlement isolation', () => {
    let counter = 0, ids = [];

    /** @summary Allocates a callback owner whose manager state this suite cleans after each test. */
    function ownerId() {
        const id = `settlement-callback-owner-${Date.now()}-${counter++}`;
        ids.push(id);
        return id
    }

    test.afterEach(() => {
        for (const id of ids) {
            Neo.getComponent(id)?.destroy();
            VDomUpdate.promiseCallbackMap.delete(id);
            VDomUpdate.mergedCallbackMap.remove(id);
            VDomUpdate.preUpdateMap.delete(id);
            VDomUpdate.postUpdateQueueMap.remove(id)
        }
        ids = []
    });

    test('a captured pre-update hook and an explicit empty phase preserve the replacement hook', () => {
        const id = ownerId(), events = [], old = () => events.push('old'), replacement = () => events.push('new');

        VDomUpdate.registerPreUpdate(id, old);
        const captured = VDomUpdate.preUpdateMap.get(id);
        VDomUpdate.preUpdateMap.delete(id);
        VDomUpdate.registerPreUpdate(id, replacement);

        VDomUpdate.executePreUpdates(id, null);
        VDomUpdate.executePreUpdates(id, undefined);
        expect(events).toEqual([]);
        expect(VDomUpdate.preUpdateMap.get(id)).toBe(replacement);

        VDomUpdate.executePreUpdates(id, captured);
        expect(events).toEqual(['old']);
        expect(VDomUpdate.preUpdateMap.get(id)).toBe(replacement);

        VDomUpdate.executePreUpdates(id);
        expect(events).toEqual(['old', 'new']);
        expect(VDomUpdate.preUpdateMap.has(id)).toBe(false)
    });

    test('a detached hook cannot consume the same function registered for a newer phase', () => {
        const id = ownerId(), events = [], callback = () => events.push('called');

        VDomUpdate.registerPreUpdate(id, callback);
        const captured = VDomUpdate.preUpdateMap.get(id);
        VDomUpdate.preUpdateMap.delete(id);
        VDomUpdate.registerPreUpdate(id, callback);

        VDomUpdate.executePreUpdates(id, captured);
        expect(events).toEqual(['called']);
        expect(VDomUpdate.preUpdateMap.get(id)).toBe(callback);

        VDomUpdate.executePreUpdates(id);
        expect(events).toEqual(['called', 'called']);
        expect(VDomUpdate.preUpdateMap.has(id)).toBe(false)
    });

    test('a captured post-update queue and an explicit empty phase preserve the replacement queue', async () => {
        const owner  = ownerId(), events = [],
              first  = Neo.create(Component, {appName, id: ownerId()}),
              second = Neo.create(Component, {appName, id: ownerId()});

        await Promise.all([first.ready(), second.ready()]);
        first.update = () => events.push('old');
        second.update = () => events.push('new');

        VDomUpdate.registerPostUpdate(owner, first.id);
        const captured = VDomUpdate.postUpdateQueueMap.get(owner);
        VDomUpdate.postUpdateQueueMap.remove(captured);
        VDomUpdate.registerPostUpdate(owner, second.id);
        const replacement = VDomUpdate.postUpdateQueueMap.get(owner);

        VDomUpdate.triggerPostUpdates(owner, null);
        VDomUpdate.triggerPostUpdates(owner, undefined);
        expect(events).toEqual([]);
        expect(VDomUpdate.postUpdateQueueMap.get(owner)).toBe(replacement);

        VDomUpdate.triggerPostUpdates(owner, captured);
        expect(events).toEqual(['old']);
        expect(VDomUpdate.postUpdateQueueMap.get(owner)).toBe(replacement);

        VDomUpdate.triggerPostUpdates(owner);
        expect(events).toEqual(['old', 'new']);
        expect(VDomUpdate.postUpdateQueueMap.has(owner)).toBe(false)
    });

    test('a throwing resolver rejects its entry and drains the claimed tail without taking a reentrant claim', () => {
        const id = ownerId(), error = new Error('resolver failed'), secondary = new Error('reject failed'), events = [];
        let rejected;

        VDomUpdate.addPromiseCallback(id, () => {
            VDomUpdate.addPromiseCallback(id, () => events.push('reentrant'));
            VDomUpdate.claimPromiseCallbacks(id);
            throw error
        }, reason => {
            rejected = reason;
            throw secondary
        });
        VDomUpdate.addPromiseCallback(id, () => events.push('claimed tail'));
        VDomUpdate.claimPromiseCallbacks(id);
        VDomUpdate.addPromiseCallback(id, () => events.push('late'));

        expect(() => VDomUpdate.executePromiseCallbacks(id)).toThrow(error);
        expect(rejected).toBe(error);
        expect(events).toEqual(['claimed tail']);
        expect(VDomUpdate.promiseCallbackMap.get(id)).toHaveLength(2);

        VDomUpdate.executePromiseCallbacks(id);

        expect(events).toEqual(['claimed tail', 'late', 'reentrant']);
        expect(VDomUpdate.promiseCallbackMap.has(id)).toBe(false)
    });

    test('a throwing merged child preserves new membership and still settles its sibling and owner', () => {
        const owner = ownerId(), first = ownerId(), second = ownerId(), error = new Error('merged resolver failed'), events = [];

        VDomUpdate.registerMerged(owner, first, 1, 1);
        VDomUpdate.registerMerged(owner, second, 1, 1);
        const collected = new Set([first, second]), oldMembership = VDomUpdate.mergedCallbackMap.get(owner);
        VDomUpdate.markMergedCollected(owner, collected);

        VDomUpdate.addPromiseCallback(first, () => {
            VDomUpdate.registerMerged(owner, first, 1, 1);
            VDomUpdate.addPromiseCallback(first, () => events.push('new child request'));
            throw error
        }, reason => events.push(reason));
        VDomUpdate.addPromiseCallback(second, () => events.push('sibling'));
        VDomUpdate.addPromiseCallback(owner, () => events.push('owner'));
        [first, second, owner].forEach(id => VDomUpdate.claimPromiseCallbacks(id));

        expect(() => VDomUpdate.executeCallbacks(owner, undefined, collected)).toThrow(error);
        expect(events).toEqual([error, 'sibling', 'owner']);
        const replacement = VDomUpdate.mergedCallbackMap.get(owner);
        expect(replacement).not.toBe(oldMembership);
        expect([...replacement.children.keys()]).toEqual([first]);
        expect(replacement.children.get(first).collected).toBeUndefined();
        expect(VDomUpdate.promiseCallbackMap.get(first)).toHaveLength(1);
        expect(VDomUpdate.promiseCallbackMap.get(first)[0].claimed).toBeUndefined();
        expect(VDomUpdate.promiseCallbackMap.has(second)).toBe(false);
        expect(VDomUpdate.promiseCallbackMap.has(owner)).toBe(false);

        VDomUpdate.markMergedCollected(owner, new Set([first]));
        VDomUpdate.claimPromiseCallbacks(first);
        VDomUpdate.executeCallbacks(owner, undefined, new Set([first]));

        expect(events).toEqual([error, 'sibling', 'owner', 'new child request']);
        expect(VDomUpdate.mergedCallbackMap.has(owner)).toBe(false);
        expect(VDomUpdate.promiseCallbackMap.has(first)).toBe(false)
    });

    test('a merged callback cannot settle a newly claimed request belonging to another callback owner', () => {
        const owner = ownerId(), child = ownerId(), error = new Error('child callback failed'), events = [];

        VDomUpdate.registerMerged(owner, child, 1, 1);
        VDomUpdate.markMergedCollected(owner, new Set([child]));
        VDomUpdate.addPromiseCallback(child, () => {
            VDomUpdate.addPromiseCallback(owner, () => events.push('new owner request'));
            VDomUpdate.claimPromiseCallbacks(owner);
            throw error
        });
        VDomUpdate.addPromiseCallback(owner, () => events.push('old owner request'));
        VDomUpdate.claimPromiseCallbacks(child);
        VDomUpdate.claimPromiseCallbacks(owner);

        expect(() => VDomUpdate.executeCallbacks(owner, undefined, new Set([child]))).toThrow(error);
        expect(events).toEqual(['old owner request']);
        expect(VDomUpdate.promiseCallbackMap.get(owner)).toHaveLength(1);
        expect(VDomUpdate.promiseCallbackMap.get(owner)[0].claimed).toBe(true);

        VDomUpdate.executePromiseCallbacks(owner);

        expect(events).toEqual(['old owner request', 'new owner request']);
        expect(VDomUpdate.promiseCallbackMap.has(owner)).toBe(false)
    });

    test('a throwing rejection drains the old queue while a newly parked request survives', () => {
        const id = ownerId(), cause = new Error('flight failed'), error = new Error('reject callback failed'), events = [];

        VDomUpdate.addPromiseCallback(id, undefined, reason => {
            events.push(reason);
            VDomUpdate.addPromiseCallback(id, undefined, next => events.push(['new', next]));
            throw error
        });
        VDomUpdate.addPromiseCallback(id, undefined, reason => events.push(['tail', reason]));

        expect(() => VDomUpdate.rejectPromiseCallbacks(id, cause)).toThrow(error);
        expect(events).toEqual([cause, ['tail', cause]]);
        expect(VDomUpdate.promiseCallbackMap.get(id)).toHaveLength(1);

        VDomUpdate.rejectPromiseCallbacks(id, cause);

        expect(events).toEqual([cause, ['tail', cause], ['new', cause]]);
        expect(VDomUpdate.promiseCallbackMap.has(id)).toBe(false)
    })
});
