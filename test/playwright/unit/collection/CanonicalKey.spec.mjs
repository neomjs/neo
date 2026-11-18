import {setup} from '../../setup.mjs';

const appName = 'CollectionCanonicalKeyTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Collection     from '../../../../src/collection/Base.mjs';

/**
 * @summary `Neo.collection.Base#getCanonicalKey()` turns a received key, such as the id fragment a list
 * item renders, into the key the collection stores. A collection declares no key type, so it reads one
 * from its first item, as `getKeyType()` does.
 */
test.describe('Neo.collection.Base#getCanonicalKey', () => {
    let collection;

    test.afterEach(() => {
        collection?.destroy();
        collection = null
    });

    test('a string-keyed collection keeps the value as received', () => {
        collection = Neo.create(Collection, {items: [{id: '10:15'}, {id: '10:30'}]});

        expect(collection.getCanonicalKey('10:30')).toBe('10:30');
        expect(collection.get(collection.getCanonicalKey('10:30'))).toEqual({id: '10:30'})
    });

    test('an integer-keyed collection parses a numeric fragment and refuses one that does not parse', () => {
        collection = Neo.create(Collection, {items: [{id: 1}, {id: 2}]});

        expect(collection.getCanonicalKey('2')).toBe(2);
        expect(collection.getCanonicalKey(2)).toBe(2);
        expect(collection.get(collection.getCanonicalKey('2'))).toEqual({id: 2});
        expect(collection.getCanonicalKey('two')).toBeUndefined();
        expect(collection.getCanonicalKey('')).toBeUndefined()
    });

    test('an absent value has no key, and an empty collection keeps the value', () => {
        collection = Neo.create(Collection, {items: [{id: 1}]});

        expect(collection.getCanonicalKey(null)).toBeUndefined();
        expect(collection.getCanonicalKey(undefined)).toBeUndefined();

        collection.clear();
        expect(collection.getCanonicalKey('7')).toBe('7')
    })
});
