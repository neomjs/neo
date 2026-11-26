import {setup} from '../../setup.mjs';

const appName = 'ListItemRecordIdPrefixTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Instance           from '../../../../src/manager/Instance.mjs';
import {defineComponent}  from '../../../../src/functional/_export.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import List               from '../../../../src/list/Base.mjs';
import ListComponent      from '../../../../src/list/Component.mjs';
import Model              from '../../../../src/data/Model.mjs';
import Store              from '../../../../src/data/Store.mjs';

/**
 * @summary `getItemRecordId()` is the inverse of `getItemId()`, which builds `${list.id}__${recordId}`.
 * A list id may itself contain `__` — a functional component's `generateIds()` names an id-less child
 * `<parentId>__<n>` — so the inverse must strip the list's own prefix instead of taking the second
 * `__` segment.
 */
test.describe('Neo.list.Base#getItemRecordId with a "__" in the list id', () => {
    class TestModel extends Model {
        static config = {
            className: 'Test.Unit.List.ItemRecordIdPrefix.Model',
            fields   : [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]
        }
    }
    Neo.setupClass(TestModel);

    const storeConfig = () => ({
        module     : Store,
        keyProperty: 'id',
        model      : TestModel,
        data       : [{id: 'a', name: 'Alpha'}, {id: 'b', name: 'Beta'}]
    });

    const store = () => Neo.create(storeConfig());

    let list;

    test.afterEach(() => {
        list?.destroy();
        list = null
    });

    test('useInternalId: true resolves the internal id, not the list id middle segment', () => {
        list = Neo.create(List, {appName, id: 'my-parent__0', displayField: 'name', store: store()});

        const record = list.store.get('b');

        expect(list.getItemRecordId(list.getItemId(record))).toBe(list.store.getInternalId(record))
    });

    test('useInternalId: false resolves the record key', () => {
        list = Neo.create(List, {appName, id: 'my-parent__0', displayField: 'name', useInternalId: false, store: store()});

        expect(list.getItemRecordId(list.getItemId(list.store.get('b')))).toBe('b')
    });

    test('a click selects the clicked record and fires select', () => {
        list = Neo.create(List, {appName, id: 'my-parent__0', displayField: 'name', store: store()});

        const record = list.store.get('b'),
              events = [];

        list.on('select', e => events.push(e));
        list.selectionModel.onListClick({currentTarget: list.getItemId(record)});

        expect(list.selectionModel.isSelected(list.getItemId(record))).toBe(true);
        expect(events).toHaveLength(1);
        expect(events[0].records).toEqual([record])
    });

    test('list.Component resolves the record key from an index item id', () => {
        list = Neo.create(ListComponent, {appName, id: 'my-parent__0', displayField: 'name', store: store()});

        expect(list.getItemRecordId(list.getItemId('b'))).toBe('b')
    });

    test('CONTROL: a list id without "__" keeps resolving as before', () => {
        list = Neo.create(List, {appName, id: 'plain-list', displayField: 'name', useInternalId: false, store: store()});

        expect(list.getItemRecordId(list.getItemId(list.store.get('a')))).toBe('a')
    });

    test('a list inside a functional component createVdom() without an id selects on click', async () => {
        const container = Neo.create(Container, {appName, id: 'list-item-record-id-container'});

        await container.initVnode();
        container.mounted = true;

        const View = defineComponent({
            config: {className: 'Test.Unit.List.ItemRecordIdPrefix.View'},

            createVdom() {
                return {cn: [{module: List, displayField: 'name', store: storeConfig()}]}
            }
        });

        const view = Neo.create(View, {appName});

        container.add(view);
        await container.timeout(50);

        const child  = [...view.childComponents.values()][0].instance,
              record = child.store.get('b');

        expect(child.id).toContain('__');

        child.selectionModel.onListClick({currentTarget: child.getItemId(record)});

        expect(child.selectionModel.isSelected(child.getItemId(record))).toBe(true);

        container.destroy()
    })
});
