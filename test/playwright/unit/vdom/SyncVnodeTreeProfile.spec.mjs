import {setup} from '../../setup.mjs';

const appName = 'SyncVnodeTreeProfileTest';

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
import ComponentManager   from '../../../../src/manager/Component.mjs';
import Container          from '../../../../src/container/Base.mjs';
import TreeBuilder        from '../../../../src/util/vdom/TreeBuilder.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
// Ensure Neo.get is defined: a container's `items` resolve through the instance manager
import InstanceManager    from '../../../../src/manager/Instance.mjs';

// Mock applyDeltas to prevent errors during mount
const realApplyDeltas = Neo.applyDeltas; // patched at import; restored in afterAll below

Neo.applyDeltas = async () => {};

test.afterAll(() => {
    Neo.applyDeltas = realApplyDeltas;
});

const
    ITERATIONS = 30,
    LEAVES     = 5,
    ROWS       = 200,
    WARMUP     = 5;

class Leaf extends Component {
    static config = {
        className: 'Test.ProfileLeaf',
        ntype    : 'test-profile-leaf',
        _vdom    : {tag: 'span'}
    }
}
Leaf = Neo.setupClass(Leaf);

class Row extends Container {
    static config = {
        className: 'Test.ProfileRow',
        ntype    : 'test-profile-row',
        _vdom    : {tag: 'li'}
    }
}
Row = Neo.setupClass(Row);

class Host extends Container {
    static config = {
        className: 'Test.ProfileHost',
        ntype    : 'test-profile-host',
        _vdom    : {tag: 'ul'}
    }
}
Host = Neo.setupClass(Host);

// The pass BEFORE the extension, restated as class overrides: the receiver tested one level and never
// recursed, and no synced child ran a pass of its own. That the profile can express it this way is
// the point of the method being a mixin method — overriding it is the extension seam.
class LegacyLeaf extends Leaf {
    static config = {
        className: 'Test.ProfileLegacyLeaf',
        ntype    : 'test-profile-legacy-leaf'
    }

    unmountRemovedChildren() {}
}
LegacyLeaf = Neo.setupClass(LegacyLeaf);

class LegacyRow extends Row {
    static config = {
        className: 'Test.ProfileLegacyRow',
        ntype    : 'test-profile-legacy-row'
    }

    unmountRemovedChildren() {}
}
LegacyRow = Neo.setupClass(LegacyRow);

class LegacyHost extends Host {
    static config = {
        className: 'Test.ProfileLegacyHost',
        ntype    : 'test-profile-legacy-host'
    }

    unmountRemovedChildren(vnodeMap, presentSet) {
        let children = ComponentManager.getDirectChildren(this.id),
            i        = 0,
            len      = children.length,
            child;

        for (; i < len; i++) {
            child = children[i];

            if (!presentSet.has(child) && !vnodeMap.get(child.vdom.id) && !child.floating) {
                child._vnode  = null;
                child.mounted = false
            }
        }
    }
}
LegacyHost = Neo.setupClass(LegacyHost);

const createTree = (HostClass, RowClass, LeafClass, suffix) => Neo.create(HostClass, {
    appName,
    id   : `profile-host-${suffix}`,
    items: Array.from({length: ROWS}, (row, r) => ({
        module: RowClass,
        id    : `profile-row-${suffix}-${r}`,
        items : Array.from({length: LEAVES}, (leaf, l) => ({module: LeafClass, id: `profile-leaf-${suffix}-${r}-${l}`}))
    }))
});

/**
 * The vdom worker's output for a full-depth render of the host — the exact input `syncVnodeTree`
 * receives after an update — regenerated per sample so no sample sees a tree a previous sync compressed.
 * @param {Neo.container.Base} host
 * @returns {Neo.vdom.VNode}
 */
const expand = host => VdomHelper.create({
    appName : host.appName,
    vdom    : TreeBuilder.getVdomTree(host.vdom, -1),
    windowId: host.windowId
}).vnode;

const median = samples => {
    const sorted = [...samples].sort((a, b) => a - b);

    return sorted[Math.floor(sorted.length / 2)]
};

/**
 * One timed `syncVnodeTree` on a freshly expanded vnode — the expansion stays outside the timed region.
 * @param {Neo.container.Base} host
 * @param {Number[]} samples
 */
const sample = (host, samples) => {
    const vnode = expand(host);

    host._vnode = vnode;

    const start = performance.now();

    host.syncVnodeTree(vnode);
    samples.push(performance.now() - start)
};

/**
 * Profiles both trees interleaved (so JIT warm-up and GC pauses land on neither side alone) after a
 * warm-up, and returns the medians in ms.
 * @param {Neo.container.Base} extended
 * @param {Neo.container.Base} legacy
 * @returns {Number[]} `[extendedMs, legacyMs]`
 */
const profilePair = (extended, legacy) => {
    const extendedSamples = [],
          legacySamples   = [],
          discard         = [];

    for (let i = 0; i < WARMUP; i++) {
        sample(extended, discard);
        sample(legacy,   discard)
    }

    for (let i = 0; i < ITERATIONS; i++) {
        sample(extended, extendedSamples);
        sample(legacy,   legacySamples)
    }

    return [median(extendedSamples), median(legacySamples)]
};

const report = (label, extendedMs, legacyMs) => console.log(
    `[syncVnodeTree profile] ${label} · ${ROWS * (LEAVES + 1)} components · ` +
    `extended ${extendedMs.toFixed(3)} ms · one-level ${legacyMs.toFixed(3)} ms · ratio ${(extendedMs / legacyMs).toFixed(2)}`
);

/**
 * @summary The extended unmount pass (every synced component, recursing through removed subtrees)
 * against the one-level pass it replaced, on the same tree shape, in the same process.
 *
 * Two shapes: every child present (the common hot path — the extension adds one `childMap` lookup
 * per synced component and a Set + Map lookup per direct child) and half the rows removed (the
 * extension walks the removed subtrees the one-level pass never reached, which is its purpose).
 * The bounds are generous on purpose — a CI worker is a noisy clock — while the printed medians are
 * the numbers to read.
 */
test.describe('syncVnodeTree unmount pass — extended vs one-level', () => {
    let extended, legacy;

    test.afterEach(() => {
        extended?.destroy();
        legacy?.destroy();
        extended = legacy = null
    });

    test('every child present: the extended pass stays within 2× of the one-level pass', async () => {
        extended = createTree(Host,       Row,       Leaf,       'current');
        legacy   = createTree(LegacyHost, LegacyRow, LegacyLeaf, 'legacy');

        await extended.initVnode(true);
        await legacy.initVnode(true);

        extended.mounted = legacy.mounted = true;

        expect(ComponentManager.getChildComponents(extended)).toHaveLength(ROWS * (LEAVES + 1));

        const [extendedMs, legacyMs] = profilePair(extended, legacy);

        report('every child present', extendedMs, legacyMs);

        // nothing left, so nothing may unmount on either tree
        expect(extended.items.every(row => row.mounted && row.items.every(leaf => leaf.mounted))).toBe(true);
        expect(legacy.items.every(row => row.mounted && row.items.every(leaf => leaf.mounted))).toBe(true);
        expect(extendedMs).toBeLessThan(legacyMs * 2)
    });

    test('half the rows removed: the extended pass reaches the leaves the one-level pass left with stale vnodes', async () => {
        extended = createTree(Host,       Row,       Leaf,       'current-removed');
        legacy   = createTree(LegacyHost, LegacyRow, LegacyLeaf, 'legacy-removed');

        await extended.initVnode(true);
        await legacy.initVnode(true);

        extended.mounted = legacy.mounted = true;

        for (const host of [extended, legacy]) {
            host.items.forEach((row, index) => {
                if (index % 2 === 0) {
                    row.vdom.removeDom = true
                }
            });

            host.updateDepth = -1;

            await host.promiseUpdate()
        }

        const removedLeaf = host => host.items[0].items[0],
              keptLeaf    = host => host.items[1].items[0];

        // the semantic gap the extension closes: both passes unmount the removed ROW (the one-level
        // pass through its own test, the container cascade flipping the leaves' flags), but only the
        // extended pass reaches the leaves' vnodes — the stale vnode a later re-seat would send as a
        // placeholder for a node the DOM no longer has
        expect(extended.items[0].mounted).toBe(false);
        expect(legacy.items[0].mounted).toBe(false);
        expect(removedLeaf(extended).vnode).toBeNull();
        expect(removedLeaf(legacy).vnode).not.toBeNull();
        expect(keptLeaf(extended).mounted).toBe(true);
        expect(keptLeaf(extended).vnode).not.toBeNull();

        const [extendedMs, legacyMs] = profilePair(extended, legacy);

        report('half the rows removed', extendedMs, legacyMs);

        expect(extendedMs).toBeLessThan(legacyMs * 3)
    });
});
