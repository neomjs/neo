import {setup} from '../../setup.mjs';

const appName = 'ContainerInsertLazyModuleTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Button         from '../../../../src/button/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';
import CardLayout     from '../../../../src/layout/Card.mjs';

/**
 * `container.Base#insert` with a lazy `module` config — the shape a card layout loads on
 * activation. Construction parks such a config (`createItem` stamps a `removeDom` placeholder
 * vnode, `createItems` pushes it into the items root); `insert` mirrors that instead of treating the
 * config as an instance. The dock projection materializes panes through `insert`, so this is the
 * contract a lazily resolved dock pane rides.
 *
 * Every arm uses a loader that resolves in a microtask (no real import): what is under test is the
 * parking and the load trigger, not module fetching. Every card container starts with one eager
 * card at the active index, because a card layout activating an index with no item is its own
 * error, not this contract's.
 */

const lazyButton = text => ({module: () => Promise.resolve({default: Button}), text});

/**
 * A resolved module whose constructions are countable — the identity witness for the concurrent-load
 * arms. A count is the only way to see a duplicate: the second instance replaced the first in
 * `items`, so the container looked correct while a live component had been orphaned.
 */
class Counted extends Button {
    static config = {
        className: 'Test.Unit.Container.InsertLazyModule.Counted'
    }

    static constructions = 0

    construct(config) {
        super.construct(config);
        Counted.constructions++
    }
}

Neo.setupClass(Counted);

const cardContainer = () => Neo.create(Container, {
    appName,
    layout: {ntype: 'card', activeIndex: 0},
    items : [{module: Button, text: 'eager'}]
});

/** Resolves once the container's card layout has replaced the parked config at `index`. */
const untilLoaded = (container, index) => new Promise(resolve => {
    const check = () => container.items[index] instanceof Neo.core.Base ? resolve(container.items[index]) : setTimeout(check, 5);

    check()
});

test.describe('Neo.container.Base#insert — a lazy module config parks, then loads on the active card index', () => {
    let container;

    test.afterEach(() => {
        container?.destroy();
        container = null
    });

    test('inserted at the active index: parked first, the placeholder vnode holds the slot, then the loaded instance takes both', async () => {
        container = cardContainer();

        const
            eager    = container.items[0],
            returned = container.insert(0, lazyButton('lazy'));

        // Parked, not thrown: the config is the item, its placeholder vnode is the slot.
        expect(returned, 'insert returns the parked config').not.toBeInstanceOf(Neo.core.Base);
        expect(returned.module, 'the loader survives parking').toEqual(expect.any(Function));
        expect(container.items[0], 'the config takes the items slot').toBe(returned);
        expect(container.items[1], 'the eager card shifted').toBe(eager);
        expect(container.vdom.cn, 'one vnode per item').toHaveLength(2);
        expect(container.vdom.cn[0].removeDom, 'the placeholder vnode keeps the index aligned').toBe(true);
        expect(container.vdom.cn[1].componentId, 'the eager reference followed its item').toBe(eager.id);

        const loaded = await untilLoaded(container, 0);

        expect(loaded, 'the active index loads the module').toBeInstanceOf(Button);
        expect(loaded.text).toBe('lazy');
        expect(container.items, 'the instance replaced the config in place').toHaveLength(2);
        expect(container.vdom.cn[0].componentId, 'and its reference replaced the placeholder').toBe(loaded.id)
    });

    test('inserted at a non-active index it stays parked, and loads when that index activates', async () => {
        container = cardContainer();

        const returned = container.insert(1, lazyButton('later'));

        expect(returned).not.toBeInstanceOf(Neo.core.Base);
        expect(container.items[1]).toBe(returned);
        expect(container.vdom.cn[1].removeDom).toBe(true);

        // Give a would-be load every chance to run: nothing may load an inactive card.
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(container.items[1], 'a non-active parked item does not load on insert').toBe(returned);
        expect(container.items[0], 'the active eager card is untouched').toBeInstanceOf(Button);

        container.layout.activeIndex = 1;

        const loaded = await untilLoaded(container, 1);

        expect(loaded, 'activation loads it, as at construction').toBeInstanceOf(Button);
        expect(loaded.text).toBe('later');
        expect(container.vdom.cn[1].componentId).toBe(loaded.id)
    });

    test('add() rides the same branch: parked at the end, loaded when that index activates', async () => {
        container = cardContainer();

        const returned = container.add(lazyButton('added'));

        expect(returned).not.toBeInstanceOf(Neo.core.Base);
        expect(container.items[1]).toBe(returned);
        expect(container.vdom.cn[1].removeDom).toBe(true);

        container.layout.activeIndex = 1;

        const loaded = await untilLoaded(container, 1);

        expect(loaded).toBeInstanceOf(Button);
        expect(loaded.text).toBe('added')
    });

    test('a rejected import at the active index logs with the container identity, clears the loading flag, and leaves the item parked so the next activation retries', async () => {
        const
            errors        = [],
            originalError = console.error;

        console.error = (...args) => errors.push(args);

        try {
            container = cardContainer();

            const broken = container.insert(0, {module: () => Promise.reject(new Error('chunk failed to load')), text: 'broken'});

            expect(broken.isLoading, 'the load started').toBe(true);

            // Let the rejection reach the call site's failure route.
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(container.items[0], 'the config stays parked').toBe(broken);
            expect(container.vdom.cn[0].removeDom, 'behind its placeholder').toBe(true);
            expect(broken.isLoading, 'and is not flagged loading forever').toBeUndefined();
            expect(errors, 'one diagnosable line').toHaveLength(1);
            expect(errors[0][0]).toContain(container.id);
            expect(errors[0][0]).toContain('index 0');
            expect(errors[0][1]).toBeInstanceOf(Error);

            // The retry: a repaired loader loads on the next activation of that index.
            broken.module = () => Promise.resolve({default: Button});
            container.layout.activeIndex = 1;
            container.layout.activeIndex = 0;

            const loaded = await untilLoaded(container, 0);

            expect(loaded).toBeInstanceOf(Button);
            expect(loaded.text).toBe('broken')
        } finally {
            console.error = originalError
        }
    });

    test('a plain container without a card layout parks the config and leaves it parked (construction parity)', () => {
        container = Neo.create(Container, {appName, items: [{module: Button, text: 'eager'}]});

        const returned = container.insert(0, lazyButton('plain'));

        expect(returned).not.toBeInstanceOf(Neo.core.Base);
        expect(container.items[0]).toBe(returned);
        expect(container.vdom.cn[0].removeDom).toBe(true);
        expect(container.vdom.cn).toHaveLength(2)
    });

    /**
     * Two callers legitimately ask for the same parked item: a card layout loads it when its index
     * activates, and `container.Base#insert` loads it itself when the inserted index is already
     * active. `loadModule` sets `isLoading` for `form.Container` to read and never consulted it, so
     * both crossed the `await` on the import and both reached `Neo.create` — the second overwriting
     * the first instance and orphaning a live component.
     *
     * Driven with a DEFERRED loader rather than a microtask one, so the window is held open on
     * purpose. That is what makes this deterministic: the defect was found as an intermittent red on
     * unrelated PRs, because in the wild the window is only as wide as a dynamic import.
     */
    test('two concurrent loadModule calls for one parked item construct it once', async () => {
        let resolveImport;

        const deferred = new Promise(resolve => {resolveImport = resolve});

        container = cardContainer();
        container.add({module: () => deferred, text: 'lazy'});

        const parked = container.items[1];

        expect(parked, 'the config must be parked, not constructed').not.toBeInstanceOf(Neo.core.Base);

        // Both calls enter before the import settles — the race the two owners produce.
        const first  = container.layout.loadModule(parked, 1),
              second = container.layout.loadModule(parked, 1);

        resolveImport({default: Counted});

        const [a, b] = await Promise.all([first, second]);

        expect(Counted.constructions, 'exactly one construction').toBe(1);
        expect(a, 'both callers settle on the SAME instance').toBe(b);

        // The orphaning half: without the join, the second create replaced the first in `items`,
        // leaving a live component nothing referenced. Asserted so the count alone cannot carry it.
        expect(container.items[1], 'the container holds the instance both callers received').toBe(a)
    });

    /**
     * The arm above holds the SAME config object twice. This one holds two different objects naming
     * one item — which is what a re-resolution produces, and what object identity cannot see.
     *
     * `dashboard.dock`'s reconciler documents both resolver shapes as legal: a cache-backed one
     * returns the same instances, the engine's own default returns a fresh config literal. Under the
     * default, a repair pass re-resolving a pane mid-import arrived holding a new object, missed the
     * identity-keyed guard and constructed the pane twice. That surfaced as an intermittent CI red
     * whose two loads carried frame-identical stacks, differing only in the projection pass that
     * raised them — so the call site could never have told them apart.
     *
     * Deterministic here for the same reason the arm above is: the deferred loader holds the window
     * open rather than leaving it as wide as a real import.
     */
    test('a re-resolved config naming the same id joins the in-flight load instead of constructing again', async () => {
        let resolveImport;

        const deferred = new Promise(resolve => {resolveImport = resolve});

        container = cardContainer();
        container.add({id: 'insert-lazy-module-reresolved', module: () => deferred, text: 'lazy'});

        const parked = container.items[1];

        expect(parked, 'the config must be parked, not constructed').not.toBeInstanceOf(Neo.core.Base);

        // What the repair pass holds: a fresh literal for the same pane. Built here rather than
        // driven through the dock, because the discriminator is the pair of configs, not the route.
        const reResolved = {id: parked.id, module: () => deferred, text: 'lazy'};

        expect(reResolved, 'void unless the two configs are genuinely different objects').not.toBe(parked);
        expect(reResolved.id, 'and genuinely name the same item').toBe(parked.id);

        // File-shared counter: unscoped, this reads the constructions of every arm before it.
        Counted.constructions = 0;

        const first  = container.layout.loadModule(parked,     1),
              second = container.layout.loadModule(reResolved, 1);

        resolveImport({default: Counted});

        const [a, b] = await Promise.all([first, second]);

        expect(Counted.constructions, 'exactly one construction').toBe(1);
        expect(a, 'both callers settle on the SAME instance').toBe(b);
        expect(container.items[1], 'the container holds the instance both callers received').toBe(a)
    });

    /**
     * The other half of the keying, and the reason it is `id` WHEN PRESENT rather than `id`.
     *
     * `layout.Card` has never required an id on a parked config — the arms above this one carry
     * none — so keying on `id` alone would collide every id-less item onto a single `undefined`
     * key. The second caller would then join an unrelated load and receive the FIRST item's
     * instance: a container quietly holding the wrong component, which is worse than the duplicate
     * construction the id keying exists to remove. This arm fails on that shortcut and passes on
     * the superset.
     */
    test('two id-less parked configs load independently rather than colliding on one absent key', async () => {
        let resolveA, resolveB;

        const deferredA = new Promise(resolve => {resolveA = resolve}),
              deferredB = new Promise(resolve => {resolveB = resolve});

        container = cardContainer();
        container.add({module: () => deferredA, text: 'lazy a'});
        container.add({module: () => deferredB, text: 'lazy b'});

        const parkedA = container.items[1],
              parkedB = container.items[2];

        expect(parkedA.id, 'the arm needs a genuinely id-less config').toBeUndefined();
        expect(parkedB.id, 'the arm needs a genuinely id-less config').toBeUndefined();

        Counted.constructions = 0;

        // Both in flight together: a shared key is only observable while neither has settled.
        const first  = container.layout.loadModule(parkedA, 1),
              second = container.layout.loadModule(parkedB, 2);

        resolveA({default: Counted});
        resolveB({default: Counted});

        const [a, b] = await Promise.all([first, second]);

        expect(Counted.constructions, 'each id-less item constructs its own instance').toBe(2);
        expect(a, 'two different items must not settle on one instance').not.toBe(b);
        expect(container.items[2], 'and each slot holds its own').toBe(b)
    });

    test('a failed import leaves nothing in flight, so the next call retries', async () => {
        const failing  = {module: () => Promise.reject(new Error('chunk gone')), text: 'lazy'},
              original = console.error;

        console.error = () => {};

        try {
            container = cardContainer();
            container.add(failing);

            const parked = container.items[1];

            await container.layout.loadModule(parked, 1).catch(() => {});

            // The retry must actually re-enter rather than join a settled promise the map still holds.
            Counted.constructions = 0;
            parked.module         = () => Promise.resolve({default: Counted});

            const retried = await container.layout.loadModule(parked, 1);

            expect(Counted.constructions, 'the retry constructs').toBe(1);
            expect(retried).toBeInstanceOf(Counted)
        } finally {
            console.error = original
        }
    })
});
