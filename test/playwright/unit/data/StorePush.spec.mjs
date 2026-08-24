import {setup} from '../../setup.mjs';

const appName = 'StorePushTest';

setup({
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    },
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Model           from '../../../../src/data/Model.mjs';
import Pipeline        from '../../../../src/data/Pipeline.mjs';
import Store           from '../../../../src/data/Store.mjs';

let StorePushModel = class StorePushModel extends Model {
    static config = {
        className  : 'Test.Unit.Data.StorePush.Model',
        keyProperty: 'id',
        fields     : [
            {name: 'id',     type: 'Integer'},
            {name: 'rank',   type: 'Integer'},
            {name: 'status', type: 'String'},
            {name: 'type',   type: 'String'}
        ]
    }
}
StorePushModel = Neo.setupClass(StorePushModel);

let StorePushPipeline = class StorePushPipeline extends Pipeline {
    static config = {
        className: 'Test.Unit.Data.StorePush.Pipeline'
    }

    async read() {
        return [
            {id: 1, rank: 2, status: 'pending', type: 'visible'},
            {id: 2, rank: 1, status: 'pending', type: 'visible'}
        ]
    }

    simulatePush(data) {
        this.fire('push', data)
    }
}
StorePushPipeline = Neo.setupClass(StorePushPipeline);

let StringKeyPushModel = class StringKeyPushModel extends Model {
    static config = {
        className  : 'Test.Unit.Data.StorePush.StringKeyModel',
        keyProperty: 'id',
        fields     : [
            {name: 'id',     type: 'String'},
            {name: 'status', type: 'String'}
        ]
    }
}
StringKeyPushModel = Neo.setupClass(StringKeyPushModel);

let StringKeyPushPipeline = class StringKeyPushPipeline extends Pipeline {
    static config = {
        className: 'Test.Unit.Data.StorePush.StringKeyPipeline'
    }

    async read() {
        return [
            {id: '1', status: 'pending'}
        ]
    }

    simulatePush(data) {
        this.fire('push', data)
    }
}
StringKeyPushPipeline = Neo.setupClass(StringKeyPushPipeline);

function createStore(config={}) {
    return Neo.create(Store, {
        model   : StorePushModel,
        pipeline: {
            module: StorePushPipeline
        },
        ...config
    })
}

test.describe('Neo.data.Store - Push Integration', () => {

    test('Store should listen to pipeline push events and update existing records via record.set()', async () => {
        const store = createStore();

        await store.load();
        expect(store.count).toBe(2);

        let record1 = store.get(1);
        expect(record1.status).toBe('pending');

        let recordChangeFired = false,
            changedRecordId   = null;

        store.on('recordChange', data => {
            recordChangeFired = true;
            changedRecordId   = data.record.id
        });

        store.pipeline.simulatePush({id: 1, status: 'done'});

        expect(record1.status).toBe('done');
        expect(recordChangeFired).toBe(true);
        expect(changedRecordId).toBe(1);

        store.destroy()
    });

    test('Store should ignore unknown pipeline push ids by default', async () => {
        const store = createStore();

        await store.load();

        store.pipeline.simulatePush({id: 3, rank: 3, status: 'created', type: 'visible'});

        expect(store.count).toBe(2);
        expect(store.get(3)).toBe(null);

        store.destroy()
    });

    test('Store should insert unknown pipeline push ids when pushInsertStrategy is upsert', async () => {
        const store = createStore({
            pushInsertStrategy: 'upsert'
        });

        await store.load();

        store.pipeline.simulatePush({id: 3, rank: 3, status: 'created', type: 'visible'});

        expect(store.count).toBe(3);
        expect(store.get(3).status).toBe('created');

        store.destroy()
    });

    test('Store should update, not fork, when a push key arrives as a different type', async () => {
        const store = createStore({pushInsertStrategy: 'upsert'});

        await store.load();
        expect(store.count).toBe(2);

        // The stored key is the Integer 1; the push carries "1". A strict Map lookup on the received
        // value misses, and an upsert answers a miss by appending — so this asserts one identity,
        // not merely a successful update.
        store.pipeline.simulatePush({id: '1', status: 'done'});

        expect(store.count).toBe(2);
        expect(store.get(1).status).toBe('done');
        expect(store.items.filter(record => Number(record.id) === 1)).toHaveLength(1);

        // Canonicalization must not turn every push into an update: an unseen key still inserts, and
        // it lands under the key a later canonical lookup will use.
        store.pipeline.simulatePush({id: '3', rank: 3, status: 'created', type: 'visible'});

        expect(store.count).toBe(3);
        expect(store.get(3).status).toBe('created');
        expect(store.items.filter(record => Number(record.id) === 3)).toHaveLength(1);

        store.destroy()
    });

    test('Store should refuse a push key which cannot be canonicalized', async () => {
        const store = createStore({pushInsertStrategy: 'upsert'});

        await store.load();

        // `parseInt('bad')` is NaN. Persisting it would leave the record field and the map key
        // disagreeing, so the record would be unreachable by any later lookup — refuse instead.
        store.pipeline.simulatePush({id: 'bad', rank: 9, status: 'created', type: 'visible'});

        expect(store.count).toBe(2);
        expect(store.get('bad')).toBe(null);

        store.destroy()
    });

    test('Store should canonicalize a push key for a String-keyed Model too', async () => {
        const store = Neo.create(Store, {
            model   : StringKeyPushModel,
            pipeline: {module: StringKeyPushPipeline},

            pushInsertStrategy: 'upsert'
        });

        await store.load();
        expect(store.count).toBe(1);

        // The symmetric case: the stored key is the String '1' and the push carries the number 1.
        // An int-only rule would leave this one forking.
        store.pipeline.simulatePush({id: 1, status: 'done'});

        expect(store.count).toBe(1);
        expect(store.get('1').status).toBe('done');
        expect(store.items.filter(record => String(record.id) === '1')).toHaveLength(1);

        store.destroy()
    });

    test('Store should respect local sorters for inserted pipeline pushes', async () => {
        const store = createStore({
            pushInsertStrategy: 'insert',
            sorters           : [{direction: 'ASC', property: 'rank'}]
        });

        await store.load();

        expect(store.getRange().map(record => record.id)).toEqual([2, 1]);

        store.pipeline.simulatePush({id: 3, rank: 0, status: 'created', type: 'visible'});

        expect(store.getRange().map(record => record.id)).toEqual([3, 2, 1]);

        store.destroy()
    });

    test('Store should not show locally filtered-out inserted pipeline pushes', async () => {
        const store = createStore({
            filters           : [{property: 'type', value: 'visible'}],
            pushInsertStrategy: 'upsert'
        });

        await store.load();

        store.pipeline.simulatePush({id: 3, rank: 3, status: 'created', type: 'hidden'});

        expect(store.count).toBe(2);
        expect(store.get(3)).toBe(null);

        store.destroy()
    });

    test('Store should reload instead of inserting when the visible projection is uncertain', async () => {
        const stores = [
            createStore({pushInsertStrategy: 'reloadWhenUncertain', remoteFilter: true}),
            createStore({pushInsertStrategy: 'reloadWhenUncertain', pageSize: 1})
        ];

        for (const store of stores) {
            await store.load();

            let loadCount = 0;

            store.load = async () => {
                loadCount++;
                return []
            };

            store.pipeline.simulatePush({id: 3, rank: 3, status: 'created', type: 'visible'});

            expect(loadCount).toBe(1);
            expect(store.count).toBe(2);
            expect(store.get(3)).toBe(null);

            store.destroy()
        }
    });
});
