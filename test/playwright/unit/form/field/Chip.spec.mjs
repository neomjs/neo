import {setup} from '../../../setup.mjs';

const appName = 'FormFieldChipMultiSelectTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import ChipField       from '../../../../../src/form/field/Chip.mjs';
import FormContainer   from '../../../../../src/form/Container.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import StoreManager    from '../../../../../src/manager/Store.mjs';
import VdomHelper      from '../../../../../src/vdom/Helper.mjs';

test.describe('Neo.form.field.Chip multi-value contract (#17312)', () => {
    let field, form;

    const createField = () => Neo.create(ChipField, {
        appName,
        displayField: 'name',
        valueField  : 'id',
        store       : {
            data: [
                {id: 'alpha', name: 'Alpha'},
                {id: 'beta',  name: 'Beta'},
                {id: 'gamma', name: 'Gamma'}
            ]
        }
    });

    test.afterEach(() => {
        form?.destroy();
        field?.destroy();

        form = field = null
    });

    test('keeps and submits every selected store value as one array', async () => {
        field = createField();

        field.value = ['alpha', 'beta'];

        expect(Array.isArray(field.value)).toBe(true);
        expect(field.value.map(record => record.id)).toEqual(['alpha', 'beta']);
        expect(field.getSubmitValue()).toEqual(['alpha', 'beta']);

        form = Neo.create(FormContainer, {
            appName,
            items: [field]
        });

        expect(await form.getSubmitValues()).toEqual({
            [field.id]: ['alpha', 'beta']
        })
    });

    test('normalizes scalar ids and object values into a unique record array', () => {
        field = createField();

        expect(field.isDirty).toBe(false);

        field.value = 'alpha';

        expect(field.getSubmitValue()).toEqual(['alpha']);
        expect(field.isDirty).toBe(true);

        field.value = [{id: 'alpha'}, 'alpha', 'Beta'];

        expect(field.getSubmitValue()).toEqual(['alpha', 'beta']);

        field.reset();

        expect(field.getSubmitValue()).toEqual([]);
        expect(field.isDirty).toBe(false)
    });

    test('replaces its owned Store only after the shared chip projection detaches', async () => {
        field = createField();

        const
            oldStore  = field.store,
            oldRecord = oldStore.get('alpha');

        const storesBeforeReplacement = new Set(StoreManager.items.map(store => store.id));

        field.value = ['alpha'];
        field.store = [
            {id: 'alpha', name: 'Alpha Prime'},
            {id: 'delta', name: 'Delta'}
        ];

        const storesCreatedByReplacement = StoreManager.items
            .filter(store => !storesBeforeReplacement.has(store.id))
            .map(store => store.id)
            .sort();

        const expectedReplacementStores = [field.store, field.store.allItems]
            .filter(Boolean)
            .map(store => store.id)
            .sort();

        expect(oldStore.isDestroyed).toBe(true);
        expect(field.valueList.store).toBe(field.store);
        expect(storesCreatedByReplacement).toEqual(expectedReplacementStores);
        expect(field.getSubmitValue()).toEqual(['alpha']);
        expect(field.value[0]).not.toBe(oldRecord);
        expect(field.valueList.items.map(item => item.text)).toEqual(['Alpha Prime']);

        field.value = [oldRecord];

        expect(field.getSubmitValue()).toEqual(['alpha']);
        expect(field.value[0]).not.toBe(oldRecord);
        expect(field.valueList.items.map(item => item.text)).toEqual(['Alpha Prime']);

        field.store = ['Delta', 'Epsilon'];

        expect(field.getSubmitValue()).toEqual([]);

        await Promise.resolve();

        expect(field.valueList.items).toHaveLength(0)
    });

    test('canonicalizes typed keys and prefers an object key over its submit-value field', () => {
        field = Neo.create(ChipField, {
            appName,
            displayField: 'name',
            valueField  : 'slug',
            store       : {
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'id',   type: 'Integer'},
                        {name: 'name', type: 'String'},
                        {name: 'slug', type: 'String'}
                    ]
                },
                data: [{id: 1, name: 'One', slug: 'one'}]
            }
        });

        field.value = ['1'];
        expect(field.getSubmitValue()).toEqual(['one']);

        field.value = [{id: '1', slug: 'not-the-key'}];
        expect(field.getSubmitValue()).toEqual(['one'])
    });

    test('resolves converted Record keys and mapped dotted raw-object keys through full-shape identity', () => {
        field = Neo.create(ChipField, {
            appName,
            displayField: 'name',
            valueField  : 'id',
            store       : {
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'id', type: 'Integer', convert: value => Number(value)},
                        {name: 'name', type: 'String'}
                    ]
                },
                data: [{id: '1', name: 'One'}]
            }
        });

        const convertedRecord = field.store.items[0];

        expect(field.store.getCanonicalKey(1)).toBeUndefined();
        expect(field.store.getKey(convertedRecord)).toBe(1);
        expect(field.resolveValueRecord(convertedRecord)).toBe(convertedRecord);

        field.value = [convertedRecord];

        expect(field.getSubmitValue()).toEqual([1]);

        field.destroy();
        field = Neo.create(ChipField, {
            appName,
            displayField: 'name',
            valueField  : 'id',
            store       : {
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'id', mapping: 'identity.key', type: 'Integer'},
                        {name: 'name', type: 'String'}
                    ]
                },
                data: [{identity: {key: '1'}, name: 'One'}]
            }
        });

        field.value = [{identity: {key: '1'}}];

        expect(field.getSubmitValue()).toEqual([1])
    });

    test('consumes a pre-load value once so later load-producing sorts preserve user selection', async () => {
        field = Neo.create(ChipField, {
            appName,
            displayField: 'name',
            value       : ['alpha'],
            valueField  : 'id',
            store       : {
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'id', type: 'String'},
                        {name: 'name', type: 'String'}
                    ]
                }
            }
        });

        expect(field.getSubmitValue()).toEqual([]);
        expect(field.preStoreLoadValue).toEqual(['alpha']);

        field.store.data = [
            {id: 'alpha', name: 'Alpha'},
            {id: 'beta',  name: 'Beta'}
        ];

        expect(field.store.isLoaded).toBe(true);
        expect(field.resolveValueRecord('alpha')?.id).toBe('alpha');
        await expect.poll(() => field.getSubmitValue()).toEqual(['alpha']);
        expect(field.preStoreLoadValue).toBeNull();

        field.value = ['beta'];
        field.store.sorters = [{direction: 'DESC', property: 'name'}];

        expect(field.getSubmitValue()).toEqual(['beta'])
    });

    test('destroys its owned Store after the internal picker and chip projection detach', async () => {
        field = createField();

        const ownedStore = field.store;

        await field.initVnode();
        field.getPicker();
        field.destroy();
        field = null;

        expect(ownedStore.isDestroyed).toBe(true)
    });

    test('picker membership is multi-select and selected chips survive filtering', async () => {
        field = createField();

        await field.initVnode();
        field.mounted = true;
        field.getPicker();

        const
            {list} = field,
            alpha  = field.store.get('alpha'),
            beta   = field.store.get('beta'),
            ids    = [alpha, beta].map(record => list.getItemId(list.getRecordId(record)));

        expect(list.selectionModel.singleSelect).toBe(false);
        expect(list.selectionModel.toggleOnClick).toBe(true);

        await field.onListItemSelectionChange({selection: ids});

        expect(field.getSubmitValue()).toEqual(['alpha', 'beta']);
        expect(field.valueList.vdom.cn).toHaveLength(2);

        field.store.getFilter('name').value = 'Gam';

        expect(field.store.getCount()).toBe(1);
        expect(field.valueList.vdom.cn).toHaveLength(2);
        expect(field.valueList.items.map(item => item.text)).toEqual(['Alpha', 'Beta'])
    });

    test('the selected subset rebuilds on sort and reconciles a removed Store record', async () => {
        field = createField();
        field.value = ['beta'];

        field.store.sorters = [{direction: 'DESC', property: 'name'}];

        expect(field.valueList.items).toHaveLength(1);
        expect(field.valueList.items[0].text).toBe('Beta');

        field.store.remove('beta');

        expect(field.getSubmitValue()).toEqual([]);

        await Promise.resolve();

        expect(field.valueList.items).toHaveLength(0)
    });

    test('a programmatic value replaces a visible picker selection without an intermediate select event', async () => {
        field = createField();

        await field.initVnode();
        field.mounted = true;
        field.getPicker();
        field.picker.hidden = false;
        field.value = ['alpha', 'beta'];

        let selectCount = 0;

        field.on('select', () => selectCount++);
        field.value = ['gamma'];

        const selectedKeys = field.list.selectionModel.getSelection()
            .map(itemId => field.store.get(field.list.getItemRecordId(itemId)))
            .map(record => field.store.getKey(record));

        expect(field.getSubmitValue()).toEqual(['gamma']);
        expect(selectedKeys).toEqual(['gamma']);
        expect(selectCount).toBe(0)
    });

    test('native chip removal and empty-input Backspace update the same value array', async () => {
        field = createField();
        field.value = ['alpha', 'beta'];

        const
            firstChip   = field.valueList.items[0],
            secondChip  = field.valueList.items[1],
            closeButton = firstChip.vdom.cn[2],
            clickData   = {};

        expect(closeButton.tag).toBe('button');
        expect(closeButton.type).toBe('button');
        expect(closeButton['aria-label']).toBe('Remove Alpha');

        firstChip.onCloseButtonClick(clickData);

        expect(clickData.cancelBubble).toBe(true);
        expect(field.getSubmitValue()).toEqual(['beta']);
        expect(field.valueList.items[0]).toBe(firstChip);
        expect(field.valueList.items[0].value).toBe('beta');
        expect(firstChip.isDestroyed).not.toBe(true);
        expect(secondChip.isDestroyed).not.toBe(true);

        await Promise.resolve();

        expect(secondChip.isDestroyed).toBe(true);

        const keyData = {};

        field.onKeyDownBackspace(keyData);

        expect(keyData.cancelBubble).toBe(true);
        expect(field.getSubmitValue()).toEqual([]);

        field.value    = ['gamma'];
        field.readOnly = true;

        expect(field.valueList.items[0].disabled).toBe(true);
        field.valueList.items[0].onCloseButtonClick({});
        expect(field.getSubmitValue()).toEqual(['gamma'])
    });

    test('reuses a pending retired chip when selection returns before the removal delta settles', async () => {
        field = createField();
        field.value = ['alpha'];

        const chip = field.valueList.items[0];

        field.value = [];

        expect(chip.isDestroyed).not.toBe(true);
        expect(field.valueList.vdom.cn).toHaveLength(0);

        field.value = ['gamma'];

        expect(field.valueList.items[0]).toBe(chip);
        expect(chip.value).toBe('gamma');

        await Promise.resolve();

        expect(chip.isDestroyed).not.toBe(true)
    });

    test('does not retire or emit after same-turn owner destruction', async () => {
        field = createField();
        field.value = ['alpha'];

        await Promise.resolve();

        const valueList        = field.valueList;
        let   createItemsCount = 0;

        valueList.on('createItems', () => createItemsCount++);

        field.value = [];
        field.destroy();
        field = null;

        await Promise.resolve();

        expect(valueList.isDestroyed).toBe(true);
        expect(createItemsCount).toBe(0)
    });

    test('retires each chip only after the VNode flight which removes it settles', async () => {
        const
            allowVdomUpdatesInTests = Neo.config.allowVdomUpdatesInTests,
            originalUpdateBatch     = VdomHelper.updateBatch,
            flights                 = [];

        Neo.config.allowVdomUpdatesInTests = true;

        try {
            field = createField();
            field.value = ['alpha', 'beta', 'gamma'];

            await field.initVnode(true);
            field.mounted = true;
            await field.valueList.promiseUpdate();
            await expect.poll(() => [
                field.isVdomUpdating,
                field.needsVdomUpdate,
                field.valueList.isVdomUpdating,
                field.valueList.needsVdomUpdate
            ]).toEqual([false, false, false, false]);

            const [firstChip, secondChip, thirdChip] = field.valueList.items;

            VdomHelper.updateBatch = data => data.updates[field.valueList.id]
                ? new Promise((resolve, reject) => flights.push({data, reject, resolve}))
                : originalUpdateBatch.call(VdomHelper, data);

            field.valueList.selectedKeys = ['alpha', 'beta'];
            await expect.poll(() => flights.length).toBe(1);

            field.valueList.selectedKeys = ['alpha'];

            flights[0].resolve(await originalUpdateBatch.call(VdomHelper, flights[0].data));
            await expect.poll(() => flights.length).toBe(2);

            expect(firstChip.isDestroyed).not.toBe(true);
            expect(secondChip.isDestroyed).not.toBe(true);
            expect(thirdChip.isDestroyed).toBe(true);

            flights[1].resolve(await originalUpdateBatch.call(VdomHelper, flights[1].data));
            await expect.poll(() => secondChip.isDestroyed).toBe(true);

            expect(firstChip.isDestroyed).not.toBe(true);
            expect(field.valueList.items).toEqual([firstChip]);

            VdomHelper.updateBatch = originalUpdateBatch;
            field.valueList.selectedKeys = ['alpha', 'beta'];
            await field.valueList.promiseUpdate();
            await expect.poll(() => [
                field.valueList.isVdomUpdating,
                field.valueList.needsVdomUpdate
            ]).toEqual([false, false]);

            const reboundChip = field.valueList.items[1];

            flights.length = 0;
            VdomHelper.updateBatch = data => data.updates[field.valueList.id]
                ? new Promise((resolve, reject) => flights.push({data, reject, resolve}))
                : originalUpdateBatch.call(VdomHelper, data);

            field.valueList.selectedKeys = ['alpha'];
            await expect.poll(() => flights.length).toBe(1);

            field.valueList.selectedKeys = ['alpha', 'beta'];

            flights[0].resolve(await originalUpdateBatch.call(VdomHelper, flights[0].data));
            await expect.poll(() => flights.length).toBe(2);

            expect(reboundChip.isDestroyed).not.toBe(true);

            flights[1].resolve(await originalUpdateBatch.call(VdomHelper, flights[1].data));
            await expect.poll(() => field.valueList.isVdomUpdating).toBe(false);

            expect(reboundChip.isDestroyed).not.toBe(true);
            expect(field.valueList.items).toEqual([firstChip, reboundChip])
        } finally {
            VdomHelper.updateBatch = originalUpdateBatch;
            Neo.config.allowVdomUpdatesInTests = allowVdomUpdatesInTests
        }
    })
});
