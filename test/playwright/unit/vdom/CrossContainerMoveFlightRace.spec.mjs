import {setup} from '../../setup.mjs';

const appName = 'CrossContainerMoveFlightRaceTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        logVdomUpdateCollisions: false,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        isMounted        : () => true,
        name             : appName,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Base               from '../../../../src/core/Base.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import VDomUpdate         from '../../../../src/manager/VDomUpdate.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

class Entry extends Container {
    static config = {
        className: 'Test.Unit.Vdom.CrossContainerMoveFlightRace.Entry',
        ntype    : 'test-cross-move-entry',
        _vdom    : {tag: 'div', cls: ['entry'], cn: []}
    }
}
Entry = Neo.setupClass(Entry);

class Group extends Container {
    static config = {
        className: 'Test.Unit.Vdom.CrossContainerMoveFlightRace.Group',
        ntype    : 'test-cross-move-group',
        _vdom    : {tag: 'section', cls: ['group'], cn: []}
    }
}
Group = Neo.setupClass(Group);

class Host extends Container {
    static config = {
        className: 'Test.Unit.Vdom.CrossContainerMoveFlightRace.Host',
        ntype    : 'test-cross-move-host',
        _vdom    : {tag: 'div', cls: ['host'], cn: []}
    }
}
Host = Neo.setupClass(Host);

class DocumentOrderDom {
    root = {id: 'document.body', children: [], parent: null, dataset: {}};

    getElementById(id, node = this.root) {
        if (node.id === id) return node;
        for (const child of node.children) {
            const match = this.getElementById(id, child);
            if (match) return match
        }
        return null
    }

    countById(id, node = this.root) {
        let count = node.id === id ? 1 : 0;
        for (const child of node.children) {
            count += this.countById(id, child)
        }
        return count
    }

    buildFromVnode(vnode, parentId = null, index = null) {
        if (!vnode || vnode.componentId) return null;
        const el = {id: vnode.id, children: [], parent: null, dataset: {}};
        if (vnode.childNodes) {
            for (const childVnode of vnode.childNodes) {
                const childEl = this.buildFromVnode(childVnode);
                if (childEl) {
                    childEl.parent = el;
                    el.children.push(childEl)
                }
            }
        }
        if (parentId) {
            const parent = this.getElementById(parentId);
            if (parent) {
                el.parent = parent;
                if (index == null || index >= parent.children.length) parent.children.push(el);
                else parent.children.splice(index, 0, el)
            }
        }
        return el
    }

    applyDeltas(deltas) {
        for (const delta of deltas) {
            if (delta.action === 'moveNode') {
                const node      = this.getElementById(delta.id),
                      newParent = this.getElementById(delta.parentId);
                if (node && newParent) {
                    if (node.parent) {
                        const idx = node.parent.children.indexOf(node);
                        if (idx > -1) node.parent.children.splice(idx, 1)
                    }
                    node.parent = newParent;
                    newParent.children.splice(delta.index, 0, node)
                }
            } else if (delta.action === 'insertNode') {
                this.buildFromVnode(delta.vnode, delta.parentId, delta.index)
            } else if (delta.action === 'removeNode') {
                const node = this.getElementById(delta.id);
                if (node?.parent) {
                    const idx = node.parent.children.indexOf(node);
                    if (idx > -1) node.parent.children.splice(idx, 1);
                    node.parent = null
                }
            }
        }
    }

    childIds(containerId) {
        const container = this.getElementById(containerId);
        return container ? container.children.map(n => n.id) : []
    }
}

/**
 * @summary Verifies pre-collection merge coalescing, post-yield parent adoption, deferred `preUpdate` draining
 * (including silent `updateDepth` escalation and error rejection), absorbed merged-callback settlement,
 * ancestor collision walks past non-colliding intermediate scopes, mid-flight incoming reparent unmount
 * protection, and clean batch-rejection state in `VdomLifecycle`.
 */
test.describe('Neo.mixin.VdomLifecycle cross-container move flight races', () => {
    const origApplyDeltas = Neo.applyDeltas,
          origTimeout     = Base.prototype.timeout,
          origUpdateBatch = VdomHelper.updateBatch;

    let created = [],
        dom     = null,
        run     = 0;

    const uid = prefix => `cross-move-${prefix}-${++run}`;

    const createHierarchy = async () => {
        dom = new DocumentOrderDom();
        Neo.applyDeltas = async (windowId, deltas) => {
            dom.applyDeltas(deltas)
        };

        const host = Neo.create(Host, {
            appName,
            autoInitVnode: true,
            autoMount    : true,
            id           : uid('host'),
            parentId     : 'document.body',
            items        : ['a', 'b', 'c', 'd'].map(key => ({
                module: Group,
                id    : uid(`group-${key}`),
                items : [{
                    module: Container,
                    id    : uid(`body-${key}`),
                    items : [0, 1].map(i => ({
                        module: Entry,
                        id    : uid(`entry-${key}-${i}`),
                        items : [{module: Component, id: uid(`leaf-${key}-${i}`), text: `${key}-${i}`}]
                    }))
                }]
            }))
        });

        created.push(host);
        await host.mountedPromise;

        const bodies = host.items.map(group => group.items[0]),
              target = bodies[1],
              source = bodies[2],
              moving = source.items[0];

        dom.getElementById(moving.id).dataset.witness = 'same-node';

        return {host, bodies, target, source, moving}
    };

    const flushMicrotasks = async (turns = 6) => {
        for (let i = 0; i < turns; i++) {
            await Promise.resolve()
        }
    };

    test.afterEach(() => {
        Base.prototype.timeout = origTimeout;
        VdomHelper.updateBatch = origUpdateBatch;
        Neo.applyDeltas        = origApplyDeltas;

        while (created.length) {
            const instance = created.pop();
            if (!instance.isDestroyed) {
                instance.destroy()
            }
        }
    });

    test('descendants merge into an ancestor awaiting pre-collection timeout(1) instead of splitting across flights', async () => {
        for (const moveAfterAncestorTimeout of [false, true]) {
            const {host, bodies, target, source, moving} = await createHierarchy();

            const timeoutGate       = [];
            let   interceptTimeouts = true;
            Base.prototype.timeout = function(ms) {
                if (interceptTimeouts && ms === 1) {
                    return new Promise(resolve => {
                        timeoutGate.push({id: this.id, resolve})
                    })
                }
                return origTimeout.call(this, ms)
            };

            const recordedDeltas = [];
            let   holdFirstBatch = moveAfterAncestorTimeout,
                releaseFirstBatch;
            const firstBatchHeld = new Promise(resolve => {releaseFirstBatch = resolve});

            VdomHelper.updateBatch = async function(data) {
                const res = await origUpdateBatch.call(this, data);
                recordedDeltas.push(...res.deltas);
                if (holdFirstBatch) {
                    holdFirstBatch = false;
                    await firstBatchHeld
                }
                return res
            };

            host.moveTo(3, 2);
            expect(VDomUpdate.isAwaitingCollection(host.id)).toBe(true);

            bodies.forEach(body => {
                body.updateDepth = -1;
                body.update()
            });

            interceptTimeouts = false;

            expect(timeoutGate.map(entry => entry.id)).toEqual([host.id]);

            if (!moveAfterAncestorTimeout) {
                target.insert(0, moving);
                timeoutGate[0].resolve()
            } else {
                timeoutGate[0].resolve();
                await flushMicrotasks();
                expect(VDomUpdate.isAwaitingCollection(host.id)).toBe(false);

                target.insert(0, moving);
                releaseFirstBatch()
            }

            await host.promiseUpdate();

            const entryInserts = recordedDeltas.filter(d => d.action === 'insertNode' && d.vnode?.id === moving.id),
                  entryRemoves = recordedDeltas.filter(d => d.action === 'removeNode' && d.id === moving.id),
                  entryMoves   = recordedDeltas.filter(d => d.action === 'moveNode'   && d.id === moving.id);

            expect(entryInserts).toHaveLength(0);
            expect(entryRemoves).toHaveLength(0);
            expect(entryMoves).toHaveLength(1);
            expect(dom.countById(moving.id)).toBe(1);
            expect(dom.childIds(target.id)[0]).toBe(moving.id);
            expect(dom.childIds(source.id)).not.toContain(moving.id);
            expect(dom.getElementById(moving.id).dataset.witness).toBe('same-node');

            Base.prototype.timeout = origTimeout;
            VdomHelper.updateBatch = origUpdateBatch
        }
    });

    test('sibling initiators waking from timeout(1) yield to a covering ancestor and settle absorbed grandchild callbacks', async () => {
        const {host, target, source, moving} = await createHierarchy();
        const nestedLeaf                     = target.items[0].items[0];

        const timeoutGate       = [];
        let   interceptTimeouts = true;
        Base.prototype.timeout = function(ms) {
            if (interceptTimeouts && ms === 1) {
                return new Promise(resolve => {
                    timeoutGate.push({id: this.id, resolve})
                })
            }
            return origTimeout.call(this, ms)
        };

        const recordedDeltas = [];
        VdomHelper.updateBatch = async function(data) {
            const res = await origUpdateBatch.call(this, data);
            recordedDeltas.push(...res.deltas);
            return res
        };

        target.updateDepth = -1;
        target.update();

        nestedLeaf.text = 'updated-leaf';
        const nestedLeafPromise = nestedLeaf.promiseUpdate();

        source.updateDepth = -1;
        source.update();

        expect(timeoutGate.map(entry => entry.id)).toEqual([target.id, source.id]);

        target.insert(0, moving);
        interceptTimeouts = false;

        for (const entry of timeoutGate) {
            entry.resolve();
            await flushMicrotasks()
        }

        await Promise.all([host.promiseUpdate(), nestedLeafPromise]);

        expect(VDomUpdate.mergedCallbackMap.get(target.id)).toBeFalsy();
        expect(recordedDeltas.filter(d => d.action === 'insertNode' && d.vnode?.id === moving.id)).toHaveLength(0);
        expect(recordedDeltas.filter(d => d.action === 'removeNode' && d.id === moving.id)).toHaveLength(0);
        expect(recordedDeltas.filter(d => d.action === 'moveNode'   && d.id === moving.id)).toHaveLength(1);
        expect(dom.countById(moving.id)).toBe(1);
        expect(dom.childIds(target.id)[0]).toBe(moving.id);
        expect(dom.childIds(source.id)).not.toContain(moving.id);
        expect(dom.getElementById(moving.id).dataset.witness).toBe('same-node')
    });

    test('mid-flight incoming insert preserves child vnode across stale target sync while genuine removals still unmount', async () => {
        const {host, target, source, moving} = await createHierarchy();
        const removedEntry                   = target.items[1],
              removedLeaf  = removedEntry.items[0];

        let releaseTargetFlight,
            targetFlightEnteredResolve;
        const targetFlightEntered = new Promise(resolve => {targetFlightEnteredResolve = resolve}),
              targetFlightHeld    = new Promise(resolve => {releaseTargetFlight = resolve});

        const recordedDeltas      = [];
        let   interceptFirstBatch = true;

        VdomHelper.updateBatch = async function(data) {
            const res = await origUpdateBatch.call(this, data);
            recordedDeltas.push(...res.deltas);

            if (interceptFirstBatch && Object.hasOwn(data.updates, target.id)) {
                interceptFirstBatch = false;
                targetFlightEnteredResolve();
                await targetFlightHeld
            }

            return res
        };

        removedEntry.vdom.removeDom = true;
        target.updateDepth          = -1;
        const staleTargetFlight = target.promiseUpdate();

        await targetFlightEntered;

        target.insert(0, moving);

        releaseTargetFlight();
        await staleTargetFlight;

        expect(moving.mounted).toBe(true);
        expect(moving.vnode).not.toBeNull();
        expect(removedEntry.mounted).toBe(false);
        expect(removedEntry.vnode).toBeNull();
        expect(removedLeaf.mounted).toBe(false);
        expect(removedLeaf.vnode).toBeNull();

        await host.promiseUpdate();

        expect(recordedDeltas.filter(d => d.action === 'insertNode' && d.vnode?.id === moving.id)).toHaveLength(0);
        expect(recordedDeltas.filter(d => d.action === 'moveNode'   && d.id === moving.id)).toHaveLength(1);
        expect(dom.countById(moving.id)).toBe(1);
        expect(dom.childIds(target.id)[0]).toBe(moving.id);
        expect(dom.getElementById(moving.id).dataset.witness).toBe('same-node')
    });

    test('a target waking before collection joins the full-depth move queued behind a dispatched response (#20762)', async () => {
        const {host, target, source, moving} = await createHierarchy(),
              originalNode                   = dom.getElementById(moving.id),
              recordedDeltas                 = [],
              settled                        = [],
              flights                        = [];

        let releaseMovingFlight, movingFlightEnteredResolve, targetTimeoutResolve, holdMoving = true;
        const movingFlightHeld    = new Promise(resolve => {releaseMovingFlight = resolve}),
              movingFlightEntered = new Promise(resolve => {movingFlightEnteredResolve = resolve}),
              targetTimeout       = new Promise(resolve => {targetTimeoutResolve = resolve});

        // Observe completion without delaying or replacing the lifecycle's real timeout Promise.
        Base.prototype.timeout = function(ms, ...args) {
            const result = origTimeout.call(this, ms, ...args);
            if (this === target && ms === 1) result.then(targetTimeoutResolve, targetTimeoutResolve);
            return result
        };

        VdomHelper.updateBatch = async function(data) {
            const res = await origUpdateBatch.call(this, data);
            recordedDeltas.push(...res.deltas);

            if (holdMoving && Object.hasOwn(data.updates, moving.id)) {
                holdMoving = false;
                movingFlightEnteredResolve();
                await movingFlightHeld
            }

            return res
        };

        try {
            moving.cls = ['dispatched-moving-entry'];
            const movingFlight = moving.promiseUpdate().then(() => settled.push('moving'));
            flights.push(movingFlight);
            await movingFlightEntered;

            expect(moving.isVdomUpdating).toBe(true);
            expect(VDomUpdate.isAwaitingCollection(moving.id)).toBe(false);

            // Both writes happen in one synchronous turn. The target's real timeout(1) runs
            // normally; insert() itself queues the full-depth common ancestor behind the flights.
            target.style = {minHeight: '1px'};
            const targetFlight = target.promiseUpdate().then(() => settled.push('target'));
            flights.push(targetFlight);
            expect(VDomUpdate.isAwaitingCollection(target.id)).toBe(true);

            target.insert(0, moving);
            const hostFlight = host.promiseUpdate().then(() => settled.push('host'));
            flights.push(hostFlight);

            expect(host.updateDepth).toBe(-1);
            expect(host.needsVdomUpdate).toBe(true);
            expect(host.isVdomUpdating).toBe(false);
            expect(VDomUpdate.hasDispatchedDescendants(host.id, target.id)).toBe(true);

            // Let the target's pre-collection continuation run while the genuine moving response
            // remains pending. A correct merge settles the target only after that response releases.
            await targetTimeout;
            await flushMicrotasks();
            releaseMovingFlight();
            await Promise.all(flights);

            expect(settled.sort()).toEqual(['host', 'moving', 'target']);
            expect.soft(recordedDeltas.filter(d => d.action === 'insertNode' && d.vnode?.id === moving.id)).toHaveLength(0);
            expect(recordedDeltas.filter(d => d.action === 'removeNode' && d.id === moving.id)).toHaveLength(0);
            expect.soft(recordedDeltas.filter(d => d.action === 'moveNode' && d.id === moving.id)).toHaveLength(1);
            expect.soft(dom.countById(moving.id)).toBe(1);
            expect.soft(dom.childIds(source.id)).not.toContain(moving.id);
            expect(dom.childIds(target.id)[0]).toBe(moving.id);
            expect(dom.getElementById(target.id).children[0] === originalNode, 'the destination keeps the original node identity').toBe(true);
            expect(originalNode.dataset.witness).toBe('same-node')
        } finally {
            releaseMovingFlight();
            await Promise.allSettled(flights)
        }
    });

    test('a shallow initiator carrying a merged full-depth target keeps the move in its common ancestor (#20762)', async () => {
        const {host, target, source, moving} = await createHierarchy(),
              carrier                        = target.parent,
              originalNode                   = dom.getElementById(moving.id),
              recordedDeltas                 = [],
              settled                        = [],
              flights                        = [];

        // Let a real cycle reset the intermediate parent's own depth to one.
        carrier.cls = ['primed-carrier'];
        await carrier.promiseUpdate();
        expect(carrier.updateDepth).toBe(1);

        let releaseMovingFlight, movingFlightEnteredResolve, carrierTimeoutResolve, holdMoving = true;
        const movingFlightHeld    = new Promise(resolve => {releaseMovingFlight = resolve}),
              movingFlightEntered = new Promise(resolve => {movingFlightEnteredResolve = resolve}),
              carrierTimeout      = new Promise(resolve => {carrierTimeoutResolve = resolve});

        Base.prototype.timeout = function(ms, ...args) {
            const result = origTimeout.call(this, ms, ...args);
            if (this === carrier && ms === 1) result.then(carrierTimeoutResolve, carrierTimeoutResolve);
            return result
        };

        VdomHelper.updateBatch = async function(data) {
            const res = await origUpdateBatch.call(this, data);
            recordedDeltas.push(...res.deltas);

            if (holdMoving && Object.hasOwn(data.updates, moving.id)) {
                holdMoving = false;
                movingFlightEnteredResolve();
                await movingFlightHeld
            }

            return res
        };

        try {
            moving.cls = ['dispatched-moving-entry'];
            const movingFlight = moving.promiseUpdate().then(() => settled.push('moving'));
            flights.push(movingFlight);
            await movingFlightEntered;

            // The intermediate parent owns a real pre-collection flight. A target config write
            // merges into it; public insert() widens the target and queues the common ancestor.
            carrier.style = {minHeight: '1px'};
            const carrierFlight = carrier.promiseUpdate().then(() => settled.push('carrier'));
            flights.push(carrierFlight);
            target.style = {minHeight: '1px'};
            target.insert(0, moving);
            const targetFlight = target.promiseUpdate().then(() => settled.push('target')),
                  hostFlight   = host.promiseUpdate().then(() => settled.push('host'));
            flights.push(targetFlight, hostFlight);

            expect(carrier.updateDepth).toBe(1);
            expect(VDomUpdate.isAwaitingCollection(carrier.id)).toBe(true);
            expect(target.updateDepth).toBe(-1);
            expect(VDomUpdate.mergedCallbackMap.get(carrier.id)?.children.get(target.id)?.childUpdateDepth).toBe(-1);
            expect(host.updateDepth).toBe(-1);
            expect(host.needsVdomUpdate).toBe(true);
            expect(host.isVdomUpdating).toBe(false);
            expect(VDomUpdate.hasDispatchedDescendants(host.id, carrier.id)).toBe(true);

            await carrierTimeout;
            await flushMicrotasks();
            releaseMovingFlight();
            await Promise.all(flights);

            expect(settled.sort()).toEqual(['carrier', 'host', 'moving', 'target']);
            expect.soft(recordedDeltas.filter(d => d.action === 'insertNode' && d.vnode?.id === moving.id)).toHaveLength(0);
            expect(recordedDeltas.filter(d => d.action === 'removeNode' && d.id === moving.id)).toHaveLength(0);
            expect.soft(recordedDeltas.filter(d => d.action === 'moveNode' && d.id === moving.id)).toHaveLength(1);
            expect.soft(dom.countById(moving.id)).toBe(1);
            expect.soft(dom.childIds(source.id)).not.toContain(moving.id);
            expect(dom.childIds(target.id)[0]).toBe(moving.id);
            expect(dom.getElementById(target.id).children[0] === originalNode, 'the destination keeps the original node identity').toBe(true);
            expect(originalNode.dataset.witness).toBe('same-node')
        } finally {
            releaseMovingFlight();
            await Promise.allSettled(flights)
        }
    });

    test('a shallow queued ancestor does not capture a target behind unrelated dispatched work (#20762)', async () => {
        const {host, bodies, target} = await createHierarchy(),
              busy                   = bodies[3].items[0],
              targetNode             = dom.getElementById(target.id),
              recordedDeltas         = [],
              settled                = [],
              flights                = [];

        // An ordinary completed cycle resets the next host update to its default shallow depth.
        host.cls = ['primed-host'];
        await host.promiseUpdate();
        expect(host.updateDepth).toBe(1);

        let releaseBusyFlight, busyFlightEnteredResolve, holdBusy = true;
        const busyFlightHeld    = new Promise(resolve => {releaseBusyFlight = resolve}),
              busyFlightEntered = new Promise(resolve => {busyFlightEnteredResolve = resolve});

        VdomHelper.updateBatch = async function(data) {
            const res = await origUpdateBatch.call(this, data);
            recordedDeltas.push(...res.deltas);

            if (holdBusy && Object.hasOwn(data.updates, busy.id)) {
                holdBusy = false;
                busyFlightEnteredResolve();
                await busyFlightHeld
            }

            return res
        };

        try {
            busy.cls = ['dispatched-unrelated-entry'];
            const busyFlight = busy.promiseUpdate().then(() => settled.push('busy'));
            flights.push(busyFlight);
            await busyFlightEntered;

            target.cls = ['independent-target'];
            const targetFlight = target.promiseUpdate().then(() => settled.push('target'));
            flights.push(targetFlight);

            host.cls = ['pending-shallow-host'];
            const hostFlight = host.promiseUpdate().then(() => settled.push('host'));
            flights.push(hostFlight);

            expect(host.updateDepth).toBe(1);
            expect(host.needsVdomUpdate).toBe(true);
            expect(host.isVdomUpdating).toBe(false);
            expect(VDomUpdate.hasDispatchedDescendants(host.id, target.id)).toBe(true);

            await expect.poll(() => [...settled], {timeout: 1000}).toEqual(['target']);
            const settledWhileBusy = [...settled];

            releaseBusyFlight();
            await Promise.all(flights);

            expect(settledWhileBusy, 'the target can render independently of the shallow pending ancestor').toEqual(['target']);
            expect(settled.sort()).toEqual(['busy', 'host', 'target']);
            expect(target.vnode.className).toContain('independent-target');
            expect(host.vnode.className).toContain('pending-shallow-host');
            expect(recordedDeltas.filter(d => ['insertNode', 'moveNode', 'removeNode'].includes(d.action))).toEqual([]);
            expect(dom.countById(target.id)).toBe(1);
            expect(dom.getElementById(target.id)).toBe(targetNode)
        } finally {
            releaseBusyFlight();
            await Promise.allSettled(flights)
        }
    });

    test('a rejected updateBatch without subsequent writes clears awaitingCollectionSet and does not retry in catch', async () => {
        const {target}      = await createHierarchy();
        let   batchAttempts = 0;

        VdomHelper.updateBatch = async function() {
            batchAttempts++;
            throw new Error('synthetic updateBatch failure')
        };

        target.setSilent({cls: ['dirty-once']});
        await expect(target.promiseUpdate()).rejects.toThrow('synthetic updateBatch failure');

        await origTimeout.call(target, 15);

        expect(batchAttempts).toBe(1);
        expect(target.isVdomUpdating).toBe(false);
        expect(target.needsVdomUpdate).toBe(false);
        expect(VDomUpdate.isAwaitingCollection(target.id)).toBe(false)
    });

    test('drains deferred preUpdate before ancestor collection and propagates silent updateDepth escalation', async () => {
        const {host, target} = await createHierarchy();
        const nestedLeaf     = target.items[0].items[0];

        const timeoutGate       = [];
        let   interceptTimeouts = true;
        Base.prototype.timeout = function(ms) {
            if (interceptTimeouts && ms === 1) {
                return new Promise(resolve => {
                    timeoutGate.push({id: this.id, resolve})
                })
            }
            return origTimeout.call(this, ms)
        };

        let batchCalls = 0;
        VdomHelper.updateBatch = async function(data) {
            batchCalls++;
            return origUpdateBatch.call(this, data)
        };

        target.vdom.cls = ['entry-group-initial'];
        const targetPromise = target.promiseUpdate();

        expect(timeoutGate.map(entry => entry.id)).toEqual([target.id]);
        expect(target.isVdomUpdating).toBe(true);

        let sawUpdatingDuringPreUpdate = null;
        VDomUpdate.registerPreUpdate(target.id, () => {
            sawUpdatingDuringPreUpdate = target.isVdomUpdating;
            nestedLeaf.vdom.cls        = ['deferred-leaf'];
            target.updateDepth         = -1
        });

        host.vdom.cls = ['host-updated'];
        const hostPromise = host.promiseUpdate();

        // Wake target: it yields into host, starts host's pre-collection timeout(1), runs preUpdate, and refreshes merge depth
        timeoutGate[0].resolve();
        await flushMicrotasks();

        expect(sawUpdatingDuringPreUpdate).toBe(false);
        expect(VDomUpdate.preUpdateMap.has(target.id)).toBe(false);
        expect(VDomUpdate.mergedCallbackMap.get(host.id)?.children.get(target.id)?.childUpdateDepth).toBe(-1);
        expect(timeoutGate.map(entry => entry.id)).toEqual([target.id, host.id]);

        interceptTimeouts = false;
        timeoutGate[1].resolve();

        await Promise.all([hostPromise, targetPromise]);

        expect(batchCalls).toBe(1);
        expect(host.vnode.className).toContain('host-updated');
        expect(target.vnode.className).toContain('entry-group-initial');
        expect(nestedLeaf.vnode.className).toContain('deferred-leaf')
    });

    test('a throwing preUpdate during pre-collection yield rejects parked child callbacks while ancestor still settles', async () => {
        const {host, target} = await createHierarchy();
        const error          = new Error('yielded pre-update failure'),
              origError      = console.error;

        console.error = () => {};

        try {
            target.vdom.cls = ['child-before-throw'];
            const targetPromise = target.promiseUpdate();

            VDomUpdate.registerPreUpdate(target.id, () => {
                throw error
            });

            host.vdom.cls = ['host-survives'];
            const hostPromise = host.promiseUpdate();

            await expect(targetPromise).rejects.toBe(error);
            await hostPromise;

            expect(VDomUpdate.preUpdateMap.has(target.id)).toBe(false);
            expect(host.vnode.className).toContain('host-survives')
        } finally {
            console.error = origError
        }
    });

    test('isParentUpdating walks past a depth-1 intermediate scope to detect a colliding covering ancestor in flight', async () => {
        const {host, target} = await createHierarchy(),
              group          = host.items[1],
              entry          = target.items[0],
              addedSpanId    = uid('added-span');

        // Settle one cycle on target so its post-mount updateDepth resets to 1, matching an active scroll container
        target.vdom.cls = ['settled-once'];
        await target.promiseUpdate();
        expect(target.updateDepth).toBe(1);

        const timeoutGate       = [];
        let   interceptTimeouts = true;
        Base.prototype.timeout = function(ms) {
            if (interceptTimeouts && ms === 1) {
                return new Promise(resolve => {
                    timeoutGate.push({id: this.id, resolve})
                })
            }
            return origTimeout.call(this, ms)
        };

        let groupFlightEnteredResolve,
            releaseGroupFlight,
            holdFirstGroupBatch = true,
            batchCount          = 0;
        const groupFlightEntered = new Promise(resolve => {groupFlightEnteredResolve = resolve}),
              groupFlightHeld    = new Promise(resolve => {releaseGroupFlight = resolve}),
              recordedDeltas     = [];

        VdomHelper.updateBatch = async function(data) {
            batchCount++;
            const res = await origUpdateBatch.call(this, data);
            recordedDeltas.push(...res.deltas);

            if (holdFirstGroupBatch && Object.hasOwn(data.updates, group.id)) {
                holdFirstGroupBatch = false;
                groupFlightEnteredResolve();
                await groupFlightHeld
            }

            return res
        };

        // 1. Intermediate parent starts a depth-1 cycle and absorbs a grandchild update before collection
        target.vdom.cls = ['target-scrolling'];
        const targetFlight = target.promiseUpdate();

        entry.vdom.cn.push({tag: 'span', id: addedSpanId, cls: ['active'], text: 'step-1'});
        entry.updateDepth = -1;
        const entryStep1 = entry.promiseUpdate();

        expect(VDomUpdate.mergedCallbackMap.get(target.id)?.children.has(entry.id)).toBe(true);

        // 2. Covering ancestor queues a full-depth dense render; waking target yields into group
        group.vdom.cls    = ['group', 'synced'];
        group.updateDepth = -1;
        group.denseUpdate = true;
        const groupFlight = group.promiseUpdate();

        timeoutGate[0].resolve();
        await flushMicrotasks();

        expect(timeoutGate.map(item => item.id)).toEqual([target.id, group.id]);

        // 3. Dispatch group's covering batch and hold it in flight: target is registered in flight at depth 1
        interceptTimeouts = false;
        timeoutGate[1].resolve();
        await groupFlightEntered;

        expect(VDomUpdate.getInFlightUpdateDepth(target.id)).toBe(1);
        expect(VDomUpdate.getInFlightUpdateDepth(group.id)).toBe(-1);
        expect(entry.isVdomUpdating).toBe(false);

        // 4. Grandchild updates again while group's batch is still in flight; it must defer to group, not race
        entry.vdom.cn[1].cls = [];
        entry.updateDepth    = -1;
        const entryStep2 = entry.promiseUpdate();

        await origTimeout.call(entry, 10);

        expect(batchCount).toBe(1);
        expect(VDomUpdate.postUpdateQueueMap.get(group.id)?.children.some(c => c.childId === entry.id)).toBe(true);

        releaseGroupFlight();
        await Promise.all([groupFlight, targetFlight, entryStep1, entryStep2]);

        expect(batchCount).toBe(2);
        expect(recordedDeltas.filter(d => d.action === 'insertNode' && d.vnode?.id === addedSpanId)).toHaveLength(1);
        expect(recordedDeltas.filter(d => d.id === addedSpanId && d.cls?.remove?.includes('active'))).toHaveLength(1);
        expect(dom.countById(addedSpanId)).toBe(1);
        expect(entry.vnode.childNodes[1].className).toEqual([])
    });
});
