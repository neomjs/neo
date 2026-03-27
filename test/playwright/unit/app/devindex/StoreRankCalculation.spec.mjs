import {setup} from '../../../setup.mjs';

const appName = 'DevIndexRankTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}    from '@playwright/test';
import fs                from 'fs';
import path              from 'path';
import Neo               from '../../../../../src/Neo.mjs';
import * as core         from '../../../../../src/core/_export.mjs';
import InstanceManager   from '../../../../../src/manager/Instance.mjs';
import ContributorsStore from '../../../../../apps/devindex/store/Contributors.mjs';

test.describe.serial('DevIndex Store Ranking Logic', () => {

    test('Rank calculation ignores search filters and respects structural filters', async () => {
        const store = Neo.create(ContributorsStore, {
            autoLoad: false,
            proxy   : null,
            initialChunkSize: 0 // Disable chunking for predictable synchronous adds
        });

        // Use a tiny mock dataset
        const data = [
            { l: 'User1', tc: 500, cc: 'DE' }, // global rank 1
            { l: 'User2', tc: 400, cc: 'US' }, // global rank 2
            { l: 'User3', tc: 300, cc: 'DE' }, // global rank 3
            { l: 'User4', tc: 200, cc: 'FR' }, // global rank 4
            { l: 'User5', tc: 100, cc: 'DE' }  // global rank 5
        ];

        store.add(data);
        
        expect(store.count).toBe(5);

        // Verify initial ranks
        let items = store._items;
        expect(items[0].rank).toBe(1);
        expect(items[1].rank).toBe(2);
        expect(items[2].rank).toBe(3);
        expect(items[3].rank).toBe(4);
        expect(items[4].rank).toBe(5);

        // 1. Apply a SEARCH filter (should NOT change rank)
        store.getFilter('login').value = 'User3';
        
        items = store._items;
        expect(items.length).toBe(1);
        expect(items[0].l).toBe('User3');
        expect(items[0].rank).toBe(3); // Rank should remain 3

        // 2. Apply a STRUCTURAL filter (Country DE)
        // With User3 still in the login filter, the grid will only show 1 row.
        // But his rank should be calculated among all DE users.
        // DE users: User1 (1), User3 (2), User5 (3)
        // So User3 should get rank 2.
        store.getFilter('countryCode').value = 'DE';

        items = store._items;
        expect(items.length).toBe(1);
        expect(items[0].l).toBe('User3');
        expect(items[0].rank).toBe(2); // Rank MUST be 2

        // 3. Clear SEARCH filter (keep DE)
        store.getFilter('login').value = null;

        items = store._items;
        expect(items.length).toBe(3); // User1, User3, User5
        expect(items[0].rank).toBe(1); // User1
        expect(items[1].rank).toBe(2); // User3
        expect(items[2].rank).toBe(3); // User5

        store.destroy();
    });
});
