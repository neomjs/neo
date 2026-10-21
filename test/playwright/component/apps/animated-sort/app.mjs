import Button        from '../../../../../src/button/Base.mjs';
import ComponentList from '../../../../../src/list/Component.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import VBox          from '../../../../../src/layout/VBox.mjs';

const records = () => [
    {id: 1, name: 'echo', online: true},
    {id: 2, name: 'bravo', online: false},
    {id: 3, name: 'delta', online: true},
    {id: 4, name: 'alpha', online: false},
    {id: 5, name: 'charlie', online: true}
];
let instanceSequence = 0;

/** @summary A focusable card whose construction identity survives record-keyed reseating. */
class Card extends Button {
    static config = {className: 'Neo.AnimatedSortTest.Card', record: null};
    instanceTag = ++instanceSequence
}
Card = Neo.setupClass(Card);

/**
 * @summary The roster's record-keyed pooling contract on an ordinary Engine component list.
 * @class Neo.AnimatedSortTest.List
 * @extends Neo.list.Component
 */
class List extends ComponentList {
    static config = {
        className          : 'Neo.AnimatedSortTest.List',
        animate            : true,
        itemHeight         : 80,
        itemWidth          : 200,
        useInternalId      : false,
        pluginAnimateConfig: {transitionDuration: 500, transitionEasing: 'linear'},
        action_            : null
    }
    /** @summary Cards belong to records, including records temporarily filtered out. */
    cards = new Map()

    /** @summary Addresses a wrapper by its record rather than its current index. */
    getItemId(recordOrId) {
        return `${this.id}__item-${recordOrId?.isRecord ? this.getRecordId(recordOrId) : recordOrId}`
    }

    /** @summary Resolves the fixed numeric keys used by this fixture. */
    getItemRecordId(id) {
        return Number(id.slice(this.id.length + '__item-'.length))
    }

    /** @summary Reuses one card per record and seats the pool in current Store order. */
    createItemContent(record, index) {
        const key  = this.getRecordId(record);
        let   card = this.cards.get(key);
        if (!card) {
            card = Neo.create(Card, {
                appName: this.appName, windowId: this.windowId, parentId: this.id,
                id     : `${this.id}__card-${key}`, record, text: `${record.name}${record.detail ? ': ' + record.detail : ''}`
            });
            this.cards.set(key, card)
        } else {
            card.setSilent({record, text: `${record.name}${record.detail ? ': ' + record.detail : ''}`})
        }
        const pool = this.items || [];
        if (!pool.includes(card)) pool.push(card);
        const prior = pool.indexOf(card);
        [pool[index], pool[prior]] = [pool[prior], pool[index]];
        this.items = pool;
        this.updateDepth = -1;
        return [card.createVdomReference()]
    }

    /** @summary Sorts the record-owned pool without replacing or renaming its components. */
    sortItems({items}) {
        if (this.items) {
            const ordered = items.map(record => this.cards.get(this.getRecordId(record)));
            this.items = ordered.concat(this.items.filter(card => !ordered.includes(card)))
        }
    }

    /** @summary Drives the real Store notifications, never the plugin directly. */
    afterSetAction(value) {
        if (!value) return;
        if (value.type === 'load') this.store.data = value.data;
        else if (value.type === 'remove-sort') {
            this.store.remove(value.id);
            this.store.sorters = [{property: 'name', direction: 'ASC'}]
        }
        else if (value.type === 'change') this.store.get(value.id).detail = 'changed';
        else if (value === 'filter-online') this.store.filters = [{property: 'online', value: true}];
        else if (value === 'unfilter') this.store.filters = [];
        else if (value === 'reload') this.store.data = records();
        else if (value === 'online') this.store.sorters = [{property: 'online', direction: 'DESC'}, {property: 'name', direction: 'ASC'}];
        else this.store.sorters = [{property: 'name', direction: value === 'name-desc' ? 'DESC' : 'ASC'}]
    }

    /** @summary Exposes record, descriptor and component identities from the actual App Worker. */
    get observation() {
        return {
            order     : this.store.items.map(record => record.id),
            nodes     : this.getVdomRoot().cn.map(node => ({id: node.id, transform: node.style?.transform})),
            cards     : this.items.map(card => ({id: card.id, recordId: card.record.id, instanceTag: card.instanceTag})),
            selection : this.selectionModel?.items,
            focusIndex: this.focusIndex,
            columns   : this.getPlugin('list-animate').columns
        }
    }
}
List = Neo.setupClass(List);

/** @summary The index-pooled calendar sibling, without the roster's key-address overrides. */
class IndexList extends List {
    static config = {className: 'Neo.AnimatedSortTest.IndexList'}

    getItemId(recordId) {
        return ComponentList.prototype.getItemId.call(this, recordId)
    }

    getItemRecordId(id) {
        return ComponentList.prototype.getItemRecordId.call(this, id)
    }

    createItemContent(record, index) {
        const items = this.items || [], config = {id: this.getComponentId(index), record, text: `${record.name}${record.detail ? ': ' + record.detail : ''}`};
        let   card  = items[index];
        if (card) card.setSilent(config);
        else items[index] = card = Neo.create(Card, {
            appName: this.appName, windowId: this.windowId, parentId: this.id, ...config
        });
        this.items = items;
        this.updateDepth = -1;
        return [card.createVdomReference()]
    }

    sortItems(data) {
        ComponentList.prototype.sortItems.call(this, data)
    }
}
IndexList = Neo.setupClass(IndexList);

export const onStart = () => Neo.app({
    name    : 'AnimatedSortTestApp',
    mainView: {
        module: Viewport, id: 'animated-sort-viewport', layout: {ntype: 'vbox', align: 'start'},
        items : [
            ...['name-asc', 'name-desc', 'online'].map(action => ({
                module : Button, id: `sort-${action}`, text: action,
                handler: () => { Neo.get('animated-sort-list').action = action }
            })),
            {
                module: List, id: 'animated-sort-list', width: 700, height: 220,
                store : {
                    module: Store, id: 'animated-sort-store', keyProperty: 'id', autoInitRecords: true,
                    model : {fields: [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}, {name: 'online', type: 'Boolean'}, {name: 'detail', type: 'String', defaultValue: ''}]},
                    data  : records()
                }
            },
            {
                module: IndexList, id: 'indexed-sort-list', width: 700, height: 220,
                store : {
                    module: Store, id: 'indexed-sort-store', keyProperty: 'id', autoInitRecords: true,
                    model : {fields: [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}, {name: 'online', type: 'Boolean'}, {name: 'detail', type: 'String', defaultValue: ''}]},
                    data  : records()
                }
            }
        ]
    }
});
