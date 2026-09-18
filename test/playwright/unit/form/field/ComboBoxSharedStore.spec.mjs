import {setup} from '../../../setup.mjs';

const appName = 'ComboBoxSharedStoreTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../../src/manager/Instance.mjs';
import ComponentManager   from '../../../../../src/manager/Component.mjs';
import VdomHelper         from '../../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import Component          from '../../../../../src/component/Base.mjs';
import ComboBox           from '../../../../../src/form/field/ComboBox.mjs';
import CountryField       from '../../../../../src/form/field/Country.mjs';
import List               from '../../../../../src/list/Base.mjs';
import Store              from '../../../../../src/data/Store.mjs';
import Model              from '../../../../../src/data/Model.mjs';
import StateProvider      from '../../../../../src/state/Provider.mjs';

class CountryModel extends Model {
    static config = {
        className: 'Test.Unit.Combo.SharedStore.CountryModel',
        fields   : [{name: 'code', type: 'String'}, {name: 'name', type: 'String'}]
    }
}

Neo.setupClass(CountryModel);

const COUNTRIES = [{code: 'de', name: 'Germany'}, {code: 'fr', name: 'France'}, {code: 'it', name: 'Italy'}];

/**
 * @summary An app-level store other readers also use, loaded before any field sees it.
 * @returns {Neo.data.Store}
 */
const sharedStore = () => Neo.create(Store, {autoInitRecords: true, keyProperty: 'code', model: CountryModel, data: COUNTRIES});

/**
 * @summary A field the way a provider binding delivers its store: created with a pending `bind.store`
 * and a raw value, handed the already-loaded store afterwards.
 * @param {Neo.data.Store} store
 * @returns {Promise<Neo.form.field.ComboBox>}
 */
async function boundCombo(store) {
    const combo = Neo.create(ComboBox, {
        appName,
        bind        : {store: 'stores.countries'},
        displayField: 'name',
        valueField  : 'code',
        value       : 'de'
    });

    await combo.initVnode();
    combo.mounted = true;
    combo.store   = store;

    return combo
}

/**
 * @summary A CountryField the way a grid editor builds one: its class-default store in place, a raw value, and a
 * `bind.store` its parent's provider resolves as construction ends, after the value was applied.
 * @param {Neo.data.Store} store
 * @param {String} value
 * @returns {{field: Neo.form.field.Country, parent: Neo.component.Base}}
 */
function providedCountryField(store, value) {
    const parent = Neo.create(Component, {appName, stateProvider: {stores: {countries: store}}}),
          field  = Neo.create(CountryField, {
              appName,
              bind          : {store: 'stores.countries'},
              forceSelection: true,
              parentId      : parent.id,
              value,
              valueField    : 'code'
          });

    return {field, parent}
}

test.describe('Neo.form.field.ComboBox on a store it does not own', () => {
    test('a raw value resolves to its record once an already-loaded bound store arrives', async () => {
        const store = sharedStore(),
              combo = await boundCombo(store);

        expect(Neo.isRecord(combo.value), 'the value is the record, not the raw key').toBe(true);
        expect(combo.value.name).toBe('Germany');

        combo.destroy();
        store.destroy()
    });

    test('typing narrows only the field\'s view: every other reader keeps every record', async () => {
        const store = sharedStore(),
              combo = await boundCombo(store);

        combo.doFilter('Ger');

        expect(combo.listStore.getCount(), 'the list shows the match').toBe(1);
        expect(store.getCount(), 'the owner\'s store is not filtered').toBe(3);
        expect(store.get('fr')?.name, 'a record the typing excludes is still there for other readers').toBe('France');
        expect(store.filters.length).toBe(0);

        combo.destroy();
        store.destroy()
    });

    test('destroying a field whose picker opened leaves the owner\'s store alive and as it found it', async () => {
        const store       = sharedStore(),
              combo       = await boundCombo(store),
              {listStore} = combo;

        combo.getPicker();
        combo.doFilter('Ger');
        combo.destroy();

        expect(store.isDestroyed, 'the owner\'s store survives the field').not.toBe(true);
        expect(store.getCount()).toBe(3);
        expect(store.filters.length).toBe(0);
        expect(listStore.isDestroyed, 'the field\'s own view goes with it').toBe(true);

        store.destroy()
    });

    test('a store swap retires only what the field owned: the old view, never the old owner\'s store', async () => {
        const first  = sharedStore(),
              second = sharedStore(),
              combo  = await boundCombo(first),
              view   = combo.listStore;

        combo.getPicker();
        combo.store = second;

        expect(first.isDestroyed).not.toBe(true);
        expect(view.isDestroyed).toBe(true);
        expect(combo.list.store, 'the list shows the new view').toBe(combo.listStore);
        expect(combo.listStore).not.toBe(second);

        combo.destroy();
        first.destroy();
        second.destroy()
    });
});

test.describe('Neo.form.field.ComboBox bound to a store while it holds a class-default one', () => {
    test('a value the default store lacks resolves against the store the binding delivers', () => {
        const store           = Neo.create(Store, {autoInitRecords: true, keyProperty: 'code', model: CountryModel, data: [{code: 'US', name: 'United States'}]}),
              {field, parent} = providedCountryField(store, 'US');

        expect(field.store).toBe(store);
        expect(field.value, 'the default store only knows `us`').toBe(store.get('US'));
        expect(field.inputValue).toBe('United States');

        field.destroy();
        parent.destroy();
        store.destroy()
    });

    test('a value the default store holds ends as the bound store\'s record, not the discarded one\'s', () => {
        const store           = sharedStore(),
              {field, parent} = providedCountryField(store, 'de');

        expect(field.value).toBe(store.get('de'));
        expect(field.inputValue).toBe('Germany');

        field.destroy();
        parent.destroy();
        store.destroy()
    });
});

test.describe('Neo.form.field.ComboBox on a store it created', () => {
    test('shows and destroys its own store, whether or not the picker ever opened', async () => {
        for (const openPicker of [false, true]) {
            const combo = Neo.create(ComboBox, {appName, displayField: 'name', valueField: 'code', store: {model: CountryModel, data: COUNTRIES}});

            await combo.initVnode();
            combo.mounted = true;
            openPicker && combo.getPicker();

            const {store} = combo;

            expect(combo.listStore, 'no view over a store the field owns').toBe(store);

            combo.destroy();
            expect(store.isDestroyed, `destroyed with the field (picker opened: ${openPicker})`).toBe(true)
        }
    });
});

test.describe('Neo.list.Base store swap', () => {
    test('autoDestroyStore governs a swap the way it governs destroy()', () => {
        for (const autoDestroyStore of [true, false]) {
            const first  = sharedStore(),
                  second = sharedStore(),
                  list   = Neo.create(List, {appName, autoDestroyStore, displayField: 'name', store: first});

            list.store = second;
            expect(first.isDestroyed === true, `autoDestroyStore: ${autoDestroyStore}`).toBe(autoDestroyStore);

            list.destroy();
            first.isDestroyed || first.destroy();
            second.isDestroyed || second.destroy()
        }
    });
});
