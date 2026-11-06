import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'NativeSelectUnit'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import Component       from '../../../../../src/component/Base.mjs';
import Form            from '../../../../../src/form/Container.mjs';
import Select          from '../../../../../src/form/field/Select.mjs';
import Store           from '../../../../../src/data/Store.mjs';
import StateProvider   from '../../../../../src/state/Provider.mjs';

const instances = [],
      create    = (module, config={}) => {
          const instance = Neo.create(module, {appName: 'NativeSelectUnit', ...config});
          instances.push(instance);
          return instance
      },
      options = [{id: 0, name: 'Number zero'}, {id: '0', name: 'String zero'},
          {id: false, name: 'False'}, {id: '', name: 'Empty string'}];

test.afterEach(() => instances.splice(0).reverse().forEach(instance => instance.destroy()));

test.describe('Native Select Store and form contract', () => {
    test('ordinary Store configs get the same default Model with or without an explicit base class', async () => {
        for (const selector of [{}, {ntype: 'store'}, {module: Store}, {className: 'Neo.data.Store'}]) {
            const field = create(Select, {store: {...selector, data: options}, value: false});
            await field.ready();
            expect(field.getSubmitValue()).toBe(false);
            expect(field.getSelectedRecord().name).toBe('False')
        }
    });

    test('an obsolete native token after Store replacement cannot change or emit a selection', async () => {
        const field = create(Select, {options: ['old'], value: 'old'});
        await field.ready();
        const obsolete = field.getInputEl().cn[1].value;
        field.options = ['current'];
        field.value = 'current';
        const events = [];
        field.on('change', () => events.push('change'));
        field.on('userChange', () => events.push('userChange'));
        field.onInputValueChange({value: obsolete});
        expect(field.value).toBe('current');
        expect(field.getInputEl().cn.find(option => option.selected).html).toBe('current');
        expect(events).toEqual([])
    });

    test('lazy mapped Store rows render through their owning Model, including an initially filtered selection', async () => {
        const store = create(Store, {autoInitRecords: false,
            model  : {fields: [{name: 'id', mapping: 'key'}, {name: 'name', mapping: 'label'}]},
            data   : [{key: 1, label: 'One'}, {key: 2, label: 'Two'}],
            filters: [{property: 'key', operator: '===', value: 1}]
        });
        const field = create(Select, {store, value: 2});
        await field.ready();
        expect(field.getSubmitValue()).toBe(2);
        expect(field.getInputEl().cn.map(option => option.html || option.text)).toEqual(['Select…', 'One', 'Two']);
        expect(field.getInputEl().cn[2].hidden).toBe('');
        field.getSelectedRecord().name = 'Edited hidden';
        expect(field.getInputEl().cn[2].html).toBe('Edited hidden')
    });

    test('Form server errors survive validation and Store refresh, and clear on value change or reset', async () => {
        const form  = create(Form, {items: [{module: Select, name: 'choice', options: ['a', 'b'], value: 'a'}]}),
              field = form.items[0];
        await form.ready();
        await form.setErrors({choice: 'Server rejected this choice'});
        expect(await form.isValid()).toBe(false);
        field.store.get('a').name = 'Renamed';
        expect(field.error).toBe('Server rejected this choice');
        field.value = 'b';
        expect(field.isValid()).toBe(true);
        field.error = 'Try again';
        field.reset('b');
        expect(field.error).toBeNull()
    });

    test('keeps typed and falsy choices distinct through native changes and submission', async () => {
        const field = create(Select, {options, required: true});
        await field.ready();
        expect(field.isValid()).toBe(false);
        expect(field.getInputEl().cn[0].value).toBe('');
        const optionIds = field.getInputEl().cn.map(option => option.id);
        expect(new Set(optionIds).size).toBe(optionIds.length);
        const changes = [], userChanges = [];
        field.on('change', event => changes.push(event.value));
        field.on('userChange', event => userChanges.push(event.value));

        for (const record of options) {
            const option = field.getInputEl().cn.find(option => option.html === record.name);
            expect(option.value).not.toBe('');
            field.onInputValueChange({value: option.value});
            expect(field.value).toBe(record.id);
            expect(field.getSubmitValue()).toBe(record.id);
            expect(field.isValid()).toBe(true)
        }
        expect(changes).toEqual([0, '0', false, '']);
        expect(userChanges).toEqual(changes);
        field.reset(0);
        expect(field.getSubmitValue()).toBe(0);
        expect(userChanges).toHaveLength(4)
    });

    test('missing keys do not submit until data arrives, and removal does not silently select a neighbor', async () => {
        const field = create(Select, {value: 'late'});
        await field.ready();
        const changes = [];
        field.on('change', event => changes.push(event.value));
        expect(field.value).toBe('late');
        expect(field.getSubmitValue()).toBeNull();
        expect(field.isValid()).toBe(false);
        field.store.data = [{id: 'late', name: 'Arrived'}, {id: 'other', name: 'Other'}];
        expect(field.getSubmitValue()).toBe('late');
        expect(field.isValid()).toBe(true);
        field.store.remove(field.store.get('late'));
        expect(field.value).toBe('late');
        expect(field.getSubmitValue()).toBeNull();
        expect(field.getInputEl().cn[0].selected).toBe(true);
        field.store.add({id: 'late', name: 'Returned'});
        expect(field.getSubmitValue()).toBe('late');
        expect(changes).toEqual([])
    });

    test('filtering retains the selected label while sort and record edits refresh the options', async () => {
        const field = create(Select, {options: [{id: 1, name: 'Alpha'}, {id: 2, name: 'Beta'}], value: 2});
        await field.ready();
        field.store.filters = [{property: 'id', operator: '===', value: 1}];
        expect(field.store.getCount()).toBe(1);
        expect(field.isValid()).toBe(true);
        expect(field.getSubmitValue()).toBe(2);
        expect(field.getInputEl().cn.find(option => option.selected)).toMatchObject({html: 'Beta', hidden: ''});
        field.store.filters = [];
        field.store.sorters = [{property: 'name', direction: 'DESC'}];
        expect(field.getInputEl().cn.slice(1).map(option => option.html)).toEqual(['Beta', 'Alpha']);
        field.store.get(2).name = 'Renamed';
        expect(field.getInputEl().cn.find(option => option.selected).html).toBe('Renamed')
    });

    test('borrowed Store notifications survive attachment, replacement and destruction', async () => {
        const store   = create(Store, {model: {fields: [{name: 'id'}, {name: 'name'}]}, data: [{id: 1, name: 'One'}]}),
              changes = [];
        await store.ready();
        store.on('recordChange', event => changes.push(event.record.name));
        store.get(1).name = 'Before';
        const field = create(Select, {store, value: 1});
        await field.ready();
        expect(field.store).toBe(store);
        store.get(1).name = 'Attached';
        expect(field.getInputEl().cn[1].html).toBe('Attached');
        field.options = ['Owned'];
        expect(store.isDestroyed).not.toBe(true);
        store.get(1).name = 'Detached';
        const owned = field.store;
        field.store = store;
        expect(owned.isDestroyed).toBe(true);
        field.destroy();
        store.get(1).name = 'After';
        expect(changes).toEqual(['Before', 'Attached', 'Detached', 'After']);
        expect(store.isDestroyed).not.toBe(true)
    });

    test('explicit and bound Stores win initial options; later options assignment owns its replacement', async () => {
        const store  = create(Store, {model: {fields: [{name: 'id'}, {name: 'name'}]}, data: [{id: 's', name: 'Shared'}]}),
              field  = create(Select, {options: ['Ignored'], store, value: 's'}),
              parent = create(Component, {stateProvider: {stores: {choices: store}}}),
              bound  = create(Select, {parentId: parent.id, bind: {store: 'stores.choices'}, options: ['Ignored'], value: 's'});
        await Promise.all([field.ready(), bound.ready()]);
        expect(field.store).toBe(store);
        expect(bound.store).toBe(store);
        expect(bound.getSubmitValue()).toBe('s');
        field.options = [false, 0, ''];
        const owned = field.store;
        expect(owned.items.map(record => record.id)).toEqual([false, 0, '']);
        field.options = null;
        expect(owned.isDestroyed).toBe(true);
        expect(field.store.getCount()).toBe(0)
    });

    test('Form set/reset/getValues uses typed resolved values and retains its existing disabled-field behavior', async () => {
        const form  = create(Form, {items: [{module: Select, name: 'choice', options, required: true}]}),
              field = form.items[0];
        await form.ready();
        await form.setValues({choice: false});
        expect(await form.getValues()).toEqual({choice: false});
        await form.reset({choice: 0});
        expect(field.isDirty).toBe(false);
        expect(await form.getValues()).toEqual({choice: 0});
        field.value = 'absent';
        expect(field.isValid()).toBe(false);
        expect(await form.getValues()).toEqual({choice: null});
        field.disabled = true;
        expect(field.isValid()).toBe(true);
        field.value = 0;
        expect(await form.getValues()).toEqual({choice: 0})
    });

    test('default content escapes markup; disabled options cannot change the field', async () => {
        const field = create(Select, {options: [{id: 1, name: '<b>literal</b>', disabled: true}], labelText: 'Choice'});
        await field.ready();
        expect(field.getInputEl().cn[1].html).toBe('&lt;b&gt;literal&lt;/b&gt;');
        field.onInputValueChange({value: field.getInputEl().cn[1].value});
        expect(field.value).toBeNull();
        field.hideLabel = true;
        expect(field.getInputEl()['aria-label']).toBe('Choice');
        field.name = 'choice';
        expect(field.getInputEl().name).toBe('choice')
    })
});
