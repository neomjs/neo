import {setup} from '../../setup.mjs';

const appName = 'PooledChildUnmountTest';

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

/**
 * A pooled row: a container with one nested component, so the removal recursion has a level to reach.
 */
class Card extends Container {
    static config = {
        className: 'Test.PooledCard',
        ntype    : 'test-pooled-card',
        _vdom    : {tag: 'div', cls: ['pooled-card']},
        items    : [{module: Component, cls: ['pooled-card-inner'], reference: 'inner'}]
    }
}
Card = Neo.setupClass(Card);

/**
 * A pooled row WITHOUT a container cascade: a plain component whose nested component is a logical
 * child by `parentId` and a reference in its vdom. The move arm needs a removed parent that does not
 * itself flip its children's `mounted` flag, so the flag it observes is the unmount pass's own.
 */
class Slot extends Component {
    static config = {
        className: 'Test.PooledSlot',
        ntype    : 'test-pooled-slot',
        _vdom    : {tag: 'li', cls: ['pooled-slot']}
    }
}
Slot = Neo.setupClass(Slot);

/**
 * A container that renders pooled component instances by reference — the `list.Component`
 * shape: the instances are created once with `parentId` pointing at the pool and re-seated
 * into the vdom via `createVdomReference()`, never held in `items`.
 */
class Pool extends Container {
    static config = {
        className: 'Test.Pool',
        ntype    : 'test-pool',
        _vdom    : {tag: 'ul', cls: ['pool']}
    }
}
Pool = Neo.setupClass(Pool);

class Host extends Container {
    static config = {
        className: 'Test.PoolHost',
        ntype    : 'test-pool-host',
        _vdom    : {tag: 'div', cls: ['pool-host']}
    }
}
Host = Neo.setupClass(Host);

/**
 * @summary A pooled child removed from its pool inside a COVERING ancestor flight must end unmounted —
 * and so must its own children.
 *
 * `syncVnodeTree` runs only for the component that receives a vnode. A pool whose update merged into
 * an ancestor flight with `updateDepth: -1` has its payload dropped by the collision filter, never
 * receives a vnode of its own, and (before the fix) never told its removed pooled children that their
 * nodes left. A later re-seat by reference then sends a placeholder for a node the DOM no longer has:
 * a fleet roster's empty `li` after a settled-empty refill.
 */
test.describe('Pooled children removed inside a covering ancestor flight', () => {
    let host, pool, cards, testRun = 0;

    const settle = () => new Promise(resolve => setTimeout(resolve, 100));

    const createTree = () => {
        host = Neo.create(Host, {
            appName,
            id   : `pool-host-${testRun}`,
            items: [
                {module: Component, id: `pool-title-${testRun}`, text: 'title'},
                {module: Pool,      id: `pool-${testRun}`}
            ]
        });

        pool = host.items[1];

        cards = [0, 1].map(index => Neo.create(Card, {
            appName,
            id      : `pool-card-${testRun}-${index}`,
            parentId: pool.id,
            windowId: pool.windowId
        }));

        pool.vdom.cn = cards.map(card => card.createVdomReference());
    };

    const removeRowsInsideCoveringFlight = async () => {
        // the ancestor is dirty first (a silent config change queues its own update) ...
        host.setSilent({style: {color: 'blue'}});
        host.updateDepth = -1;

        // ... so the pool's empty render merges into the ancestor's flight instead of flying alone
        pool.vdom.cn = [];
        pool.update();

        await host.promiseUpdate();
        await settle()
    };

    test.beforeEach(() => {
        testRun++;
    });

    test.afterEach(() => {
        cards?.forEach(card => card.destroy());
        host?.destroy();
        host = pool = cards = null;
    });

    test('CONTROL: the pool updating alone unmounts its removed pooled children', async () => {
        createTree();

        await host.initVnode(true);
        host.mounted = true;

        expect(cards.map(card => card.mounted)).toEqual([true, true]);
        expect(cards.map(card => card.vnode !== null)).toEqual([true, true]);

        pool.vdom.cn = [];
        await pool.promiseUpdate();
        await settle();

        expect(cards.map(card => card.mounted)).toEqual([false, false]);
        expect(cards.map(card => card.vnode)).toEqual([null, null]);
    });

    test('a pool update merged into an ancestor flight (updateDepth -1) unmounts the removed pooled children', async () => {
        createTree();

        await host.initVnode(true);
        host.mounted = true;

        expect(cards.map(card => card.mounted)).toEqual([true, true]);

        await removeRowsInsideCoveringFlight();

        // the rows are gone from the tree the ancestor synced — the pooled instances must know
        expect(cards.map(card => card.mounted)).toEqual([false, false]);
        expect(cards.map(card => card.vnode)).toEqual([null, null]);
    });

    test('the removal reaches the pooled child\'s own children', async () => {
        createTree();

        await host.initVnode(true);
        host.mounted = true;

        const inner = cards.map(card => card.getReference('inner'));

        expect(inner.map(item => item.mounted)).toEqual([true, true]);

        await removeRowsInsideCoveringFlight();

        // a re-inlined card references its inner component by id: a stale vnode one level down
        // would render the card without it
        expect(inner.map(item => item.mounted)).toEqual([false, false]);
        expect(inner.map(item => item.vnode)).toEqual([null, null]);
    });

    test('CONSEQUENCE: a re-seated pooled child is inserted as a node, not moved as a placeholder', async () => {
        createTree();

        await host.initVnode(true);
        host.mounted = true;

        await removeRowsInsideCoveringFlight();

        // refill: the first card is re-seated by reference, exactly like a list row coming back
        pool.vdom.cn = [cards[0].createVdomReference()];

        const {deltas} = await pool.promiseUpdate();

        const inserted = deltas.filter(delta =>
            delta.action === 'insertNode' &&
            (delta.vnode?.id === cards[0].id || delta.outerHTML?.includes(cards[0].id))
        );

        // with a stale vnode the tree builder sends a placeholder and the diff moves a node that
        // no longer exists (zero deltas); a correctly unmounted child is inlined and INSERTED
        expect(inserted.length, JSON.stringify(deltas)).toBe(1);
        expect(cards[0].mounted).toBe(true);
        expect(cards[0].getReference('inner').mounted).toBe(true);
    });

    test('MOVE: a node moved out of a removed parent in the same update keeps its vnode and its mounted flag', async () => {
        // a slot (no container cascade) holding one nested component by reference, plus a sibling
        // node the flight moves that component into
        host = Neo.create(Host, {
            appName,
            id   : `pool-host-${testRun}`,
            items: [
                {module: Component, id: `pool-title-${testRun}`, text: 'title'},
                {module: Pool,      id: `pool-${testRun}`},
                {module: Component, id: `pool-keep-${testRun}`, cls: ['keep']}
            ]
        });

        pool = host.items[1];

        let keep  = host.items[2],
            slot  = Neo.create(Slot,      {appName, id: `pool-slot-${testRun}`,  parentId: pool.id, windowId: pool.windowId}),
            inner = Neo.create(Component, {appName, id: `pool-inner-${testRun}`, parentId: slot.id, windowId: pool.windowId, text: 'inner'});

        cards = [slot, inner];

        slot.vdom.cn = [inner.createVdomReference()];
        pool.vdom.cn = [slot.createVdomReference()];

        await host.initVnode(true);
        host.mounted = true;

        expect([slot.mounted, inner.mounted]).toEqual([true, true]);

        // one covering flight: the pool drops the slot while `keep` takes the slot's inner node
        host.setSilent({style: {color: 'blue'}});
        host.updateDepth = -1;

        pool.vdom.cn = [];
        keep.vdom.cn = [inner.createVdomReference()];
        pool.update();
        keep.update();

        const {deltas} = await host.promiseUpdate();

        await settle();

        // the worker moves the reused node BEFORE it removes the node that held it
        const moveIndex   = deltas.findIndex(delta => delta.action === 'moveNode'   && delta.id === inner.id),
              removeIndex = deltas.findIndex(delta => delta.action === 'removeNode' && delta.id === slot.id);

        expect(moveIndex,   JSON.stringify(deltas)).toBeGreaterThan(-1);
        expect(removeIndex, JSON.stringify(deltas)).toBeGreaterThan(-1);
        expect(moveIndex).toBeLessThan(removeIndex);

        // the removed slot is unmounted; the moved node — still in the synced tree — is not
        expect(slot.mounted).toBe(false);
        expect(slot.vnode).toBeNull();
        expect(inner.mounted).toBe(true);
        expect(inner.vnode).not.toBeNull();
        expect(inner.parentId).toBe(slot.id);
    });
});
