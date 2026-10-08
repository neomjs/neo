import {setup} from '../../setup.mjs';

const appName = 'VdomLifecycleStateTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import VDomUpdate         from '../../../../src/manager/VDomUpdate.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

// Mock applyDeltas to prevent errors during mount
// Captured before the patch below, which lands at IMPORT time — there is no hook boundary early
// enough to capture from. Playwright reuses a worker across spec files, so an unrestored no-op does
// not crash a later spec; it silences the delta channel and lets that spec's assertions pass empty.
const realApplyDeltas = Neo.applyDeltas;

Neo.applyDeltas = async () => {};

test.afterAll(() => {
    Neo.applyDeltas = realApplyDeltas;
});

class MockComponent extends Component {
    static config = {
        className: 'Test.Unit.Vdom.VdomLifecycle.MockComponent',
        ntype    : 'test-unit-vdom-vdomlifecycle-mock',
        hideMode : 'removeDom',
        _vdom    : {tag: 'div', cls: ['child']}
    }
}
MockComponent = Neo.setupClass(MockComponent);

/**
 * @summary Verifies the state consistency of the VdomLifecycle mixin.
 *
 * Focuses on critical state flags like `mounted` and properties like `vnode`
 * during lifecycle events such as initialization, mounting, and hiding (removeDom).
 * Ensuring these states are correct is essential for the reliability of the
 * `TreeBuilder` and `VdomHelper` logic.
 */
test.describe('VdomLifecycle State', () => {

    /**
     * Verifies that `initVnode` correctly initializes the component state even if
     * the component is configured to be hidden (`removeDom`) initially.
     *
     * Expected behavior:
     * 1. `mounted` should be true because `initVnode(true)` was called.
     * 2. `vnode` should be populated (not null) because `initVnode` forces creation by clearing `removeDom`.
     */
    test('vnode should be null for initially hidden (removeDom) components', async () => {
        const comp = Neo.create(MockComponent, {
            appName,
            hidden   : true,
            hideMode : 'removeDom',
            autoMount: true // Try to mount
        });

        await comp.initVnode(true);

        expect(comp.mounted).toBe(true);
        expect(comp.vnode).not.toBeNull();

        comp.destroy();
    });

    /**
     * Verifies that the `vnode` property persists when a visible component is hidden
     * using `hideMode: 'removeDom'`.
     *
     * This persistence is critical for race condition handling: logic that checks
     * `component.vnode` relies on it being truthy even if the component is temporarily unmounted.
     */
    test('vnode should PERSIST when component is hidden (removeDom) after being visible', async () => {
        const comp = Neo.create(MockComponent, {
            appName,
            autoMount: true
        });

        await comp.initVnode(true);

        expect(comp.mounted).toBe(true);
        expect(comp.vnode).not.toBeNull();

        // Hide the component (triggers removeDom logic)
        comp.hidden = true;

        // Wait for update cycle to complete
        await new Promise(resolve => setTimeout(resolve, 50));

        // Ensure vnode reference is not cleared upon unmounting
        expect(comp.mounted).toBe(false);
        expect(comp.vnode).not.toBeNull();

        comp.destroy();
    });
});
/**
 * @summary Protects every disjoint payload root for the full Helper round trip, including the
 * deeper root a shallow initiator carries. Descendant writes wait for that root's own outcome.
 */
test.describe('Disjoint VDOM batch protection', () => {
    let root, owner, middle, leaf, testRun = 0;

    const originalUpdateBatch = VdomHelper.updateBatch;

    test.beforeEach(async () => {
        const prefix = `vdom-disjoint-flight-${++testRun}`;

        root = Neo.create(Container, {
            appName,
            id         : `${prefix}-root`,
            updateDepth: 1,
            items      : [{
                module     : Container,
                id         : `${prefix}-owner`,
                updateDepth: 3,
                items      : [{
                    module: Container,
                    id    : `${prefix}-middle`,
                    items : [{
                        module: Component,
                        id    : `${prefix}-leaf`,
                        vdom  : {tag: 'div', text: 'before'}
                    }]
                }]
            }]
        });

        await root.initVnode(true);
        root.mounted = true;

        owner  = root.items[0];
        middle = owner.items[0];
        leaf   = middle.items[0];
        await root.promiseUpdate();
        await owner.promiseUpdate()
    });

    test.afterEach(() => {
        VdomHelper.updateBatch = originalUpdateBatch;
        root.destroy()
    });

    for (const rejectFirst of [false, true]) {
        test(`a deep disjoint root protects its descendant and releases queued work after ${rejectFirst ? 'rejection' : 'success'}`, async () => {
            let enterBatch, releaseBatch, rejectBatch, response, vnodeAtCallback;

            const entered          = new Promise(resolve => enterBatch = resolve),
                  held             = new Promise((resolve, reject) => {
                      releaseBatch = resolve;
                      rejectBatch  = reject
                  }),
                  calls   = [],
                  flights = [],
                  error   = new Error('held disjoint batch rejected'),
                  text    = rejectFirst ? 'after-rejection' : 'after-success';

            VdomHelper.updateBatch = async function(data) {
                const first = calls.length === 0;

                calls.push(Object.keys(data.updates));
                if (first) {
                    enterBatch(data);
                    await held
                }

                const result = await originalUpdateBatch.call(this, data);
                if (first) response = result;
                return result
            };

            /** @summary Observes rejection immediately so a held failing flight never leaks an unhandled promise. */
            const track = promise => {
                const outcome = promise.then(
                    value => ({status: 'fulfilled', value}),
                    reason => ({status: 'rejected', reason})
                );
                flights.push(outcome);
                return outcome
            };

            try {
                owner.updateDepth = 3;
                root.vdom.cls  = ['disjoint-root-change'];
                owner.vdom.cls = ['disjoint-owner-change'];
                VDomUpdate.addPromiseCallback(root.id, () => vnodeAtCallback = owner.vnode);

                const rootFlight = track(root.promiseUpdate());
                root.update();
                const ownerFlight = track(owner.promiseUpdate());

                const batch = await entered;

                expect(Object.keys(batch.updates).sort(),
                    'the shallow initiator carries the deeper root as a separate payload')
                    .toEqual([root.id, owner.id].sort());
                expect(root.isVdomUpdating).toBe(true);
                expect(owner.isVdomUpdating, 'the emitted root is protected while Helper is pending').toBe(true);
                expect(VDomUpdate.getInFlightUpdateDepth(root.id)).toBe(1);
                expect(VDomUpdate.getInFlightUpdateDepth(owner.id)).toBe(3);
                expect(VDomUpdate.descendantInFlightMap.get(root.id)?.has(owner.id)).toBe(true);

                leaf.vdom.text = text;
                const leafFlight = track(leaf.promiseUpdate());

                expect(VDomUpdate.postUpdateQueueMap.get(owner.id)?.children.map(entry => entry.childId),
                    'the grandchild yields to the deep payload, beyond the initiator\'s scope')
                    .toContain(leaf.id);
                expect(leaf.isVdomUpdating).toBe(false);
                await new Promise(resolve => setTimeout(resolve, 10));
                expect(calls, 'no overlapping Helper batch starts while the payload is held').toHaveLength(1);

                rejectFirst ? rejectBatch(error) : releaseBatch();

                const outcomes = await Promise.all([rootFlight, ownerFlight]);
                for (const outcome of outcomes) {
                    expect(outcome.status).toBe(rejectFirst ? 'rejected' : 'fulfilled');
                    rejectFirst && expect(outcome.reason).toBe(error)
                }

                if (!rejectFirst) {
                    expect(vnodeAtCallback,
                        'the initiator callback sees the acknowledged disjoint root')
                        .toEqual(expect.objectContaining({id: owner.id, className: response.vnodes[owner.id].className}))
                }

                expect((await leafFlight).status, 'the released descendant runs its own healthy flight').toBe('fulfilled');
                expect(calls.some(ids => ids.includes(leaf.id))).toBe(true);
                expect(leaf.vnode.textContent).toBe(text);

                const components = [root, owner, middle, leaf],
                      ids        = components.map(component => component.id);

                await expect.poll(() => components.every(component => !component.isVdomUpdating)
                    && ids.every(id => !VDomUpdate.inFlightUpdateMap.has(id)
                        && !VDomUpdate.postUpdateQueueMap.has(id)
                        && !VDomUpdate.promiseCallbackMap.has(id)
                        && !VDomUpdate.mergedCallbackMap.has(id))
                    && [...VDomUpdate.descendantInFlightMap.values()]
                        .every(map => ids.every(id => !map.has(id))),
                {message: 'both outcomes release flags, registry ownership, callbacks and queued work'}).toBe(true)
            } finally {
                releaseBatch();
                await Promise.all(flights);
                VdomHelper.updateBatch = originalUpdateBatch
            }
        })
    }
});

/**
 * @summary A missing reply root and a destroyed initiator must release every emitted scope without
 * adopting unacknowledged state. The independently registered deep root survives initiator teardown.
 */
test.describe('Incomplete disjoint VDOM flights', () => {
    let root, owner, leaf, testRun = 0;

    const originalUpdateBatch = VdomHelper.updateBatch;

    test.beforeEach(async () => {
        const prefix = `vdom-incomplete-flight-${++testRun}`;

        root = Neo.create(Component, {appName, id: `${prefix}-root`});
        owner = Neo.create(Container, {
            appName,
            id   : `${prefix}-owner`,
            items: [{module: Component, id: `${prefix}-leaf`, vdom: {tag: 'div', text: 'before'}}]
        });

        await root.initVnode(true);
        await owner.initVnode(true);
        await root.promiseUpdate();
        await owner.promiseUpdate();
        root.updateDepth  = 1;
        owner.updateDepth = 3;
        leaf = owner.items[0]
    });

    test.afterEach(() => {
        VdomHelper.updateBatch = originalUpdateBatch;
        root.isDestroyed || root.destroy();
        owner.isDestroyed || owner.destroy()
    });

    test('a non-emitted initiator releases its flight but waits for a real mount to settle its request', async () => {
        let enterEmpty, requestState = 'pending';

        const emptyReply = new Promise(resolve => enterEmpty = resolve);

        VdomHelper.updateBatch = function(data) {
            const response = originalUpdateBatch.call(this, data);
            if (Object.keys(data.updates).length === 0) enterEmpty({data, response});
            return response
        };

        const queuedRequest = new Promise((resolve, reject) =>
            VDomUpdate.addPromiseCallback(owner.id, resolve, reject)).then(
                value => ({status: 'fulfilled', value}),
                reason => ({status: 'rejected', reason})
            );
        const request = root.promiseUpdate().then(
            value => { requestState = 'fulfilled'; return {status: 'fulfilled', value} },
            reason => { requestState = 'rejected'; return {status: 'rejected', reason} }
        );

        try {
            // Existing handover clears mounted/VNode truth during the collector's macrotask yield.
            root.vnode = null;
            root.mounted = false;
            root.vnodeInitialized = false;
            owner.vdom.cls = ['queued-behind-empty-flight'];
            VDomUpdate.registerPostUpdate(root.id, owner.id);

            const {data, response} = await emptyReply;

            expect(data.updates).toEqual({});
            expect(response.vnodes).toEqual({});
            expect(response.deltas).toEqual([]);
            await expect.poll(() => !root.isVdomUpdating
                && !VDomUpdate.inFlightUpdateMap.has(root.id)
                && !VDomUpdate.postUpdateQueueMap.has(root.id),
            {message: 'the empty reply releases borrowed flight ownership and queued work'}).toBe(true);
            expect((await queuedRequest).status).toBe('fulfilled');
            expect(owner.vnode.className).toContain('queued-behind-empty-flight');
            expect(root.vnode, 'empty work fabricates no vnode adoption').toBeNull();
            expect(requestState, 'no payload claimed this request').toBe('pending');
            const callbacks = VDomUpdate.promiseCallbackMap.get(root.id);
            expect(callbacks.length).toBeGreaterThan(0);
            expect(callbacks.every(entry => !entry.claimed)).toBe(true);

            await root.initVnode(true);
            const outcome = await request;

            expect(outcome.status).toBe('fulfilled');
            expect(requestState).toBe('fulfilled');
            expect(outcome.value.vnode.id).toBe(root.id);
            expect(root.mounted).toBe(true);
            await expect.poll(() => !root.isVdomUpdating
                && !VDomUpdate.inFlightUpdateMap.has(root.id)
                && !VDomUpdate.promiseCallbackMap.has(root.id)
                && !VDomUpdate.postUpdateQueueMap.has(root.id)).toBe(true)
        } finally {
            VdomHelper.updateBatch = originalUpdateBatch;
            root.isDestroyed || root.destroy();
            owner.isDestroyed || owner.destroy();
            await Promise.all([request, queuedRequest])
        }
    });

    for (const rejectOld of [false, true]) {
        test(`an old ${rejectOld ? 'rejected' : 'successful'} batch leaves a reused-ID replacement flight untouched`, async () => {
            let enterOld, enterReplacement, releaseOld, rejectOldReply, releaseReplacement, replacement,
                replacementState = 'pending';

            const oldEntered         = new Promise(resolve => enterOld = resolve),
                  replacementEntered = new Promise(resolve => enterReplacement = resolve),
                  oldReply           = new Promise((resolve, reject) => {
                      releaseOld     = resolve;
                      rejectOldReply = reject
                  }),
                  replacementReply = new Promise(resolve => releaseReplacement = resolve),
                  calls = [],
                  flights = [],
                  ownerId = owner.id,
                  oldError = new Error('retired owner batch failed');

            VdomHelper.updateBatch = async function(data) {
                const index = calls.length;
                calls.push(Object.keys(data.updates));
                if (index === 0) {
                    enterOld(data);
                    await oldReply
                } else if (index === 1) {
                    enterReplacement(data);
                    await replacementReply
                }
                return originalUpdateBatch.call(this, data)
            };

            /** @summary Observes each request while both generations have independently held replies. */
            const track = promise => {
                const outcome = promise.then(
                    value => ({status: 'fulfilled', value}),
                    reason => ({status: 'rejected', reason})
                );
                flights.push(outcome);
                return outcome
            };

            try {
                owner.vdom.cls = ['retired-owner-flight'];
                const rootFlight = track(root.promiseUpdate());
                VDomUpdate.registerMerged(root.id, ownerId, 3, 1);
                const oldOwnerFlight = track(new Promise((resolve, reject) =>
                    VDomUpdate.addPromiseCallback(ownerId, resolve, reject)));

                expect(Object.keys((await oldEntered).updates).sort()).toEqual([root.id, ownerId].sort());

                owner.destroy();
                expect((await oldOwnerFlight).reason).toBe(Neo.isDestroyed);
                replacement = Neo.create(Container, {
                    appName,
                    id   : ownerId,
                    cls  : ['replacement-before-flight'],
                    items: [{module: Component, vdom: {tag: 'div', text: 'replacement'}}]
                });
                await replacement.initVnode(true);
                const replacementVnode = replacement.vnode;

                replacement.vdom.cls = ['replacement-flight'];
                const replacementFlight = track(replacement.promiseUpdate().then(
                    value => { replacementState = 'fulfilled'; return value },
                    error => { replacementState = 'rejected'; throw error }
                ));

                expect(Object.keys((await replacementEntered).updates)).toContain(ownerId);
                expect(Neo.getComponent(ownerId)).toBe(replacement);
                expect(VDomUpdate.promiseCallbackMap.get(ownerId).some(entry => entry.claimed),
                    'the replacement callback belongs to its own collected flight').toBe(true);

                rejectOld ? rejectOldReply(oldError) : releaseOld();

                const oldOutcome = await rootFlight;
                expect(oldOutcome.status).toBe(rejectOld ? 'rejected' : 'fulfilled');
                rejectOld && expect(oldOutcome.reason).toBe(oldError);
                expect(replacement.vnode, 'the old reply adopts nothing into the replacement').toBe(replacementVnode);
                expect(replacement.isVdomUpdating, 'old cleanup does not release the replacement scope').toBe(true);
                expect(VDomUpdate.getInFlightUpdateDepth(ownerId)).toBe(-1);
                expect(replacementState, 'stale merged membership cannot settle or reject the replacement').toBe('pending');
                expect(VDomUpdate.promiseCallbackMap.has(ownerId)).toBe(true);

                releaseReplacement();
                expect((await replacementFlight).status).toBe('fulfilled');
                expect(replacementState).toBe('fulfilled');
                expect(replacement.vnode.className).toContain('replacement-flight');
                await expect.poll(() => !replacement.isVdomUpdating
                    && !VDomUpdate.inFlightUpdateMap.has(ownerId)
                    && !VDomUpdate.promiseCallbackMap.has(ownerId)
                    && !VDomUpdate.postUpdateQueueMap.has(ownerId)).toBe(true)
            } finally {
                releaseOld();
                releaseReplacement();
                VdomHelper.updateBatch = originalUpdateBatch;
                root.isDestroyed || root.destroy();
                owner.isDestroyed || owner.destroy();
                replacement && !replacement.isDestroyed && replacement.destroy();
                await Promise.all(flights)
            }
        })
    }

    for (const destroyInitiator of [false, true]) {
        test(destroyInitiator
            ? 'a surviving emitted root releases queued work when its initiator is destroyed'
            : 'an omitted reply root rejects the batch before any vnode is acknowledged', async () => {
            let enterBatch, releaseBatch;

            const entered  = new Promise(resolve => enterBatch = resolve),
                  held     = new Promise(resolve => releaseBatch = resolve),
                  calls    = [],
                  flights  = [],
                  oldRoot  = root.vnode,
                  oldOwner = owner.vnode;

            VdomHelper.updateBatch = async function(data) {
                const first = calls.length === 0;

                calls.push(Object.keys(data.updates));
                if (first) {
                    enterBatch(data);
                    await held
                }

                const response = await originalUpdateBatch.call(this, data);
                if (first && !destroyInitiator) {
                    const vnodes = {...response.vnodes};
                    delete vnodes[owner.id];
                    return {...response, vnodes}
                }
                return response
            };

            /** @summary Tracks every pending request before the controlled reply can settle it. */
            const track = promise => {
                const outcome = promise.then(
                    value => ({status: 'fulfilled', value}),
                    reason => ({status: 'rejected', reason})
                );
                flights.push(outcome);
                return outcome
            };

            try {
                root.vdom.cls  = ['incomplete-root-change'];
                owner.vdom.cls = ['incomplete-owner-change'];

                const rootFlight = track(root.promiseUpdate());
                // Membership models a root reparented out of the initiator before collection.
                VDomUpdate.registerMerged(root.id, owner.id, 3, 1);
                const ownerFlight = track(new Promise((resolve, reject) =>
                    VDomUpdate.addPromiseCallback(owner.id, resolve, reject)));

                expect(Object.keys((await entered).updates).sort()).toEqual([root.id, owner.id].sort());
                expect(owner.isVdomUpdating).toBe(true);
                expect(VDomUpdate.getInFlightUpdateDepth(owner.id)).toBe(3);

                leaf.vdom.text = 'released-after-incomplete-flight';
                const leafFlight = track(leaf.promiseUpdate());
                expect(VDomUpdate.postUpdateQueueMap.get(owner.id)?.children.map(entry => entry.childId))
                    .toContain(leaf.id);

                if (destroyInitiator) {
                    root.destroy();
                    expect(owner.isDestroyed, 'the independent payload owner survives').toBeFalsy();
                    expect(owner.isVdomUpdating, 'its scope remains protected until the held reply settles').toBe(true)
                }

                releaseBatch();

                const outcomes = await Promise.all([rootFlight, ownerFlight]);
                expect(outcomes.map(outcome => outcome.status)).toEqual(['rejected', 'rejected']);
                if (destroyInitiator) {
                    expect(outcomes.map(outcome => outcome.reason)).toEqual([Neo.isDestroyed, Neo.isDestroyed])
                } else {
                    expect(outcomes[0].reason).toBeInstanceOf(Error);
                    expect(outcomes[1].reason).toBe(outcomes[0].reason);
                    expect(root.vnode).toBe(oldRoot)
                }
                expect(owner.vnode, 'the aborted reply never acknowledges the surviving root').toBe(oldOwner);
                expect((await leafFlight).status).toBe('fulfilled');
                expect(leaf.vnode.textContent).toBe('released-after-incomplete-flight');

                const ids = [root.id, owner.id, leaf.id];

                await expect.poll(() => !owner.isVdomUpdating && !leaf.isVdomUpdating
                    && ids.every(id => !VDomUpdate.inFlightUpdateMap.has(id)
                        && !VDomUpdate.postUpdateQueueMap.has(id)
                        && !VDomUpdate.promiseCallbackMap.has(id)
                        && !VDomUpdate.mergedCallbackMap.has(id))
                    && [...VDomUpdate.descendantInFlightMap.values()].every(map => ids.every(id => !map.has(id))),
                {message: 'aborted scopes release their queues and in-flight ownership'}).toBe(true)
            } finally {
                releaseBatch();
                VdomHelper.updateBatch = originalUpdateBatch;
                root.isDestroyed || root.destroy();
                owner.isDestroyed || owner.destroy();
                await Promise.all(flights)
            }
        })
    }
    test('a merged root in another window is excluded without borrowing its flight state', async () => {
        let enterBatch, releaseBatch;

        const entered = new Promise(resolve => enterBatch = resolve),
              held    = new Promise(resolve => releaseBatch = resolve);

        owner.windowId = 'vdom-incomplete-foreign-window';
        VdomHelper.updateBatch = async function(data) {
            enterBatch(data);
            await held;
            return originalUpdateBatch.call(this, data)
        };

        let flight;

        try {
            flight = root.promiseUpdate();
            VDomUpdate.registerMerged(root.id, owner.id, 3, 1);

            expect(Object.keys((await entered).updates)).toEqual([root.id]);
            expect(owner.isVdomUpdating).toBe(false);
            expect(VDomUpdate.getInFlightUpdateDepth(owner.id)).toBeUndefined();

            releaseBatch();
            await flight;

            expect(owner.isVdomUpdating).toBe(false);
            expect(VDomUpdate.getInFlightUpdateDepth(owner.id)).toBeUndefined()
        } finally {
            releaseBatch();
            await flight;
            VdomHelper.updateBatch = originalUpdateBatch
        }
    });

});
