import {setup} from '../../setup.mjs';

const appName = 'CollectionBatchCountTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo           from '../../../../src/Neo.mjs';
import * as core     from '../../../../src/core/_export.mjs';
import Collection    from '../../../../src/collection/Base.mjs';

/**
 * @summary `startUpdate()` / `endUpdate()` defer the `mutate` events of a batch, not the `count` cache the
 * class documents as `items.length`. Before the fix the outermost close left `count` at its pre-batch value,
 * so every reader — `getCount()`, a `mutate` listener, a binding to the reactive config — saw a stale count.
 */
test.describe('Neo.collection.Base batched updates publish the count', () => {
    let collection;

    const seed = () => Neo.create(Collection, {items: [{id: 1}, {id: 2}]});

    test.afterEach(() => {
        collection?.destroy();
        collection = null
    });

    test('a non-silent batch republishes count, and the mutate listener already reads it', () => {
        collection = seed();

        const seen = [];

        collection.on('mutate', () => seen.push({
            count: collection.count,
            length: collection.items.length
        }));

        collection.startUpdate();
        collection.add({id: 3});
        collection.remove(1);
        collection.add({id: 4});
        collection.endUpdate();

        expect(collection.items.map(item => item.id)).toEqual([2, 3, 4]);
        expect(collection.items.length).toBe(3);
        expect(collection.count).toBe(3);
        expect(collection.getCount()).toBe(3);
        expect(seen).toEqual([{count: 3, length: 3}])
    });

    test('a silent batch republishes count too, and still fires no mutate', () => {
        collection = seed();

        let mutations = 0;

        collection.on('mutate', () => mutations++);

        collection.startUpdate(true);
        collection.add({id: 3});
        collection.remove(1);
        collection.add({id: 4});
        collection.endUpdate(true);

        expect(collection.items.length).toBe(3);
        expect(collection.count).toBe(3);
        expect(collection.getCount()).toBe(3);
        expect(mutations).toBe(0)
    });

    test('an inner bracket keeps the count still: only the outermost close publishes', () => {
        collection = seed();

        collection.startUpdate();
        collection.startUpdate();
        collection.add({id: 3});

        expect(collection.items.length).toBe(3);
        expect(collection.count, 'the bracket is still open').toBe(2);

        collection.endUpdate();

        expect(collection.count, 'an inner close publishes nothing').toBe(2);

        collection.endUpdate();

        expect(collection.count).toBe(3)
    });

    test('a batch that does not change membership leaves count alone', () => {
        collection = seed();

        collection.startUpdate();
        collection.endUpdate();

        expect(collection.count).toBe(2);
        expect(collection.getCount()).toBe(2)
    });
});
