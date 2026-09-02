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
});
