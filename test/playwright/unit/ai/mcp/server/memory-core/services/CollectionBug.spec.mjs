import {setup} from '../../../../../../setup.mjs';

const appName = 'CollectionBugTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import { test, expect } from '@playwright/test';
import Neo              from '../../../../../../../../src/Neo.mjs';
import * as core        from '../../../../../../../../src/core/_export.mjs';
import InstanceManager  from '../../../../../../../../src/manager/Instance.mjs';

import Store from '../../../../../../../../ai/graph/Store.mjs';
import Database from '../../../../../../../../ai/graph/Database.mjs';

test.describe('Neo.collection.Base Store Bug', () => {
    test('store clear and add interaction', () => {
        let store = Neo.create({
            module: Store,
            keyProperty: 'id'
        });

        // Add initial 10 edges
        let edges = Array.from({length: 10}, (_, i) => ({ id: 'edge-' + i }));
        store.add(edges);
        expect(store.count).toBe(10);

        // CLEAR it
        store.clear();
        expect(store.count).toBe(0);

        // ADD a new edge
        store.add({id: 'new-1'});
        
        // Count should be 1
        expect(store.count).toBe(1);
        expect(store.get('new-1')).toBeDefined();
        
        // ADD another edge
        store.add({id: 'new-2'});

        // Expected: count=2, getting 'new-2' works
        expect(store.get('new-2')).toBeDefined();
        expect(store.count).toBe(2);

        // Add via single param
        store.add({id: 'new-3'});
        expect(store.get('new-3')).toBeDefined();
        expect(store.count).toBe(3);
        
        console.log("FINAL COUNT:", store.count);
        console.log("MAP SIZE:", store.map.size);
        console.log("ARRAY LENGTH:", store._items.length);
    });
});
