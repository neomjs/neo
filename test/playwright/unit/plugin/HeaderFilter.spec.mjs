import {setup} from '../../setup.mjs';

const appName = 'PluginHeaderFilterTest';
setup({appConfig: {name: appName}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';
import HeaderFilter   from '../../../../src/plugin/HeaderFilter.mjs';
import Store          from '../../../../src/data/Store.mjs';
import TextField      from '../../../../src/form/field/Text.mjs';
import NumberFilter   from '../../../../src/filter/NumberContainer.mjs';
import '../../../../src/manager/Instance.mjs';

class StoreHost extends Container {
    static config = {className: 'Test.Unit.Plugin.HeaderFilterStoreHost', store_: null}
}
Neo.setupClass(StoreHost);

class HeaderOwner extends Component {
    static config = {
        className: 'Test.Unit.Plugin.HeaderFilterOwner', dataField_: 'category', filterField: null
    }
}
Neo.setupClass(HeaderOwner);

test.describe('Neo.plugin.HeaderFilter', () => {
    let owned, echoes;
    const create = (module, config={}) => {
        const instance = Neo.create(module, {appName, ...config});
        owned.push(instance);
        return instance
    };
    const store = (filters=[]) => create(Store, {
        model: {fields: [{name: 'id', type: 'Int'}, {name: 'category', type: 'String'},
            {name: 'label', type: 'String'}, {name: 'score', type: 'Int'}]},
        data: [{id: 1, category: 'a', label: 'first', score: 1}, {id: 2, category: 'b', label: 'second', score: 2}],
        filters
    });
    const inline = (value, property='category', operator='like') => ({property, operator, value, ownerRole: 'header-inline'});
    const host   = (source, kind='grid-container') => create(StoreHost, {ntype: kind, store: source});
    const header = (container, {fieldModule=TextField, fieldConfig={}, ...config}={}) => {
        const field = create(fieldModule, {hideLabel: true, ...fieldConfig});
        field.on('change', () => ++echoes);
        field.on('operatorChange', () => ++echoes);
        const owner = create(HeaderOwner, {
            parentId: container.id, filterField: field, plugins: [{module: HeaderFilter}], ...config
        });
        return {owner, field, plugin: owner.getPlugin('plugin-header-filter')}
    };

    test.beforeEach(() => {owned = []; echoes = 0});
    test.afterEach(() => owned.reverse().forEach(instance => instance.destroy()));

    test('shared Store and recreated headers project one exact contribution without echoing', () => {
        const source     = store([inline('a'), {property: 'category', operator: 'included', value: ['a', 'b'], ownerRole: 'header-picker'}]),
            contribution = source.getFilter('category', 'header-inline'), grid = host(source), table = host(source, 'table-container'),
            first        = header(grid), second = header(table);
        expect(first.plugin.sourceStore).toBe(source);
        expect(second.field.value).toBe('a');
        first.owner.destroy();
        const replacement = header(grid);
        contribution.value = 'b';
        expect(second.field.value).toBe('b');
        expect(replacement.field.value).toBe('b');
        expect(source.getFilter('category', 'header-inline')).toBe(contribution);
        expect(source.filters).toHaveLength(2);
        expect(echoes).toBe(0)
    });

    test('external replacement and removal update the field without recreating the predicate', () => {
        const source  = store([inline('a')]), {field} = header(host(source)), original = source.filters[0];
        let   filters = 0;
        source.on('filter', () => ++filters);
        source.filters = [inline('b', 'category', 'startsWith')];
        expect(source.filters[0]).not.toBe(original);
        expect(field.value).toBe('b');
        expect(filters).toBe(1);
        source.filters = [];
        expect(field.value).toBeNull();
        expect(source.filters).toEqual([]);
        expect(filters).toBe(2);
        expect(field.isConfig('operator')).toBe(false);
        expect(Object.hasOwn(field, 'operator')).toBe(false);
        expect(echoes).toBe(0)
    });

    test('source swaps and field retargeting detach old Store events and filters observers', () => {
        const first   = store([inline('a')]), second = store([inline('b'), inline('second', 'label')]),
            container = host(first), {owner, field, plugin} = header(container);
        container.store = second;
        expect(plugin.sourceStore).toBe(second);
        expect(field.value).toBe('b');
        first.filters = [inline('obsolete')];
        first.fire('filter');
        first.fire('load');
        expect(field.value).toBe('b');
        owner.dataField = 'label';
        expect(field.value).toBe('second');
        second.getFilter('label', 'header-inline').value = 'first';
        expect(field.value).toBe('first');
        expect(first.filters).toHaveLength(1);
        expect(echoes).toBe(0)
    });

    test('moving the header releases the previous container config subscription', () => {
        const first                = store([inline('a')]), second = store([inline('b')]), oldHost = host(first), newHost = host(second, 'table-container'),
            {owner, field, plugin} = header(oldHost);
        owner.parentId = newHost.id;
        expect(plugin.sourceStore).toBe(second);
        expect(field.value).toBe('b');
        oldHost.store = store([inline('obsolete')]);
        expect(plugin.sourceStore).toBe(second);
        expect(field.value).toBe('b');
        expect(echoes).toBe(0)
    });

    test('operator-capable fields use the live operator and reset to their creation default', () => {
        const source = store([inline(1, 'score', '>=')]), {field} = header(host(source), {
            dataField  : 'score', fieldModule: NumberFilter,
            fieldConfig: {operator: '>', value: 2, fieldConfig: {disabledChars: null}}
        });
        expect(field.value).toBe(1);
        expect(field.operator).toBe('>=');
        expect(field.items[0].text).toBe('>=');
        expect(field.items[1].value).toBe(1);
        source.getFilter('score', 'header-inline').operator = '<';
        expect(field.operator).toBe('<');
        source.filters = [];
        expect(field.value).toBeNull();
        expect(field.operator).toBe('>');
        expect(field.items[0].text).toBe('>');
        expect(field.items[1].value).toBeNull();
        expect(source.filters).toEqual([]);
        expect(echoes).toBe(0)
    });

    test('a null default restores the numeric operator button affordance without authoring a filter', () => {
        const source = store([inline(1, 'score', '<')]), {field} = header(host(source), {
            dataField: 'score', fieldModule: NumberFilter, fieldConfig: {fieldConfig: {disabledChars: null}}
        });
        expect(field.operator).toBe('<');
        expect(field.items[0].text).toBe('<');
        source.filters = [];
        expect(field.operator).toBeNull();
        expect(field.items[0].value).toBeNull();
        expect(field.items[0].text).toBe(field.items[0].operators[0]);
        expect(field.items[1].value).toBeNull();
        expect(source.filters).toEqual([]);
        expect(echoes).toBe(0)
    });

    test('a field created after plugin binding is projected only when explicitly synchronized', () => {
        const source = store([inline('b')]), container = host(source), owner = create(HeaderOwner, {
            parentId: container.id, plugins: [{module: HeaderFilter}]
        }), plugin = owner.getPlugin('plugin-header-filter'), field = create(TextField, {value: 'stale'});
        field.on('change', () => ++echoes);
        expect(plugin.sourceStore).toBe(source);
        owner.filterField = field;
        plugin.syncField();
        expect(field.value).toBe('b');
        expect(echoes).toBe(0)
    });

    test('suspension is preserved, including when a field setter rejects the projection', () => {
        const source = store([inline('a')]), {field, plugin} = header(host(source));
        field.suspendEvents = true;
        source.getFilter('category', 'header-inline').value = 'b';
        expect(field.suspendEvents).toBe(true);
        const set = field.set;
        field.set = () => {throw new Error('projection rejected')};
        try {
            expect(() => plugin.syncField()).toThrow('projection rejected');
            expect(field.suspendEvents).toBe(true)
        } finally {
            field.set = set
        }
        expect(echoes).toBe(0)
    });

    test('destroy releases observations while retaining the borrowed Store and contribution', () => {
        const source               = store([inline('a')]), contribution = source.filters[0], container = host(source),
            {owner, field, plugin} = header(container);
        plugin.destroy();
        expect(source.isDestroyed).not.toBe(true);
        expect(source.filters[0]).toBe(contribution);
        expect(field.value).toBe('a');
        contribution.value = 'b';
        source.filters = [inline('after-destroy')];
        source.fire('load');
        owner.dataField = 'label';
        container.store = store([inline('replacement')]);
        expect(field.value).toBe('a');
        expect(echoes).toBe(0)
    });
});
