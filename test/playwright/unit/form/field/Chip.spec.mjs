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

    test('replaces its owned Store only after the shared chip projection detaches', () => {
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

    test('the selected subset rebuilds on sort and reconciles a removed Store record', () => {
        field = createField();
        field.value = ['beta'];

        field.store.sorters = [{direction: 'DESC', property: 'name'}];

        expect(field.valueList.items).toHaveLength(1);
        expect(field.valueList.items[0].text).toBe('Beta');

        field.store.remove('beta');

        expect(field.getSubmitValue()).toEqual([]);
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

    test('native chip removal and empty-input Backspace update the same value array', () => {
        field = createField();
        field.value = ['alpha', 'beta'];

        const
            firstChip   = field.valueList.items[0],
            closeButton = firstChip.vdom.cn[2],
            clickData   = {};

        expect(closeButton.tag).toBe('button');
        expect(closeButton.type).toBe('button');
        expect(closeButton['aria-label']).toBe('Remove Alpha');

        firstChip.onCloseButtonClick(clickData);

        expect(clickData.cancelBubble).toBe(true);
        expect(field.getSubmitValue()).toEqual(['beta']);

        const keyData = {};

        field.onKeyDownBackspace(keyData);

        expect(keyData.cancelBubble).toBe(true);
        expect(field.getSubmitValue()).toEqual([]);

        field.value    = ['gamma'];
        field.readOnly = true;

        expect(field.valueList.items[0].disabled).toBe(true);
        field.valueList.items[0].onCloseButtonClick({});
        expect(field.getSubmitValue()).toEqual(['gamma'])
    })
});
