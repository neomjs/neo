import Button        from '../../../../../src/button/Base.mjs';
import ComponentList from '../../../../../src/list/Component.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

const records = () => ['clio', 'julia', 'maryam', 'emmy', 'euclid', 'sophie', 'ada', 'grace', 'vega']
    .map((name, index) => ({id: index + 1, name, tier: 0}));

/** @summary A record's card. */
class Card extends Button {
    static config = {className: 'Neo.RecordChangeResortTest.Card', record: null}
}
Card = Neo.setupClass(Card);

/**
 * @summary A record-keyed animated component list (the Fleet roster's pooling contract) whose Store is
 * re-sorted by a `recordChange` listener registered before the list's own.
 * @class Neo.RecordChangeResortTest.List
 * @extends Neo.list.Component
 */
class List extends ComponentList {
    static config = {
        className          : 'Neo.RecordChangeResortTest.List',
        action_            : null,
        animate            : true,
        itemHeight         : 60,
        itemWidth          : 200,
        pluginAnimateConfig: {transitionDuration: 500, transitionEasing: 'linear'},
        useInternalId      : false
    }

    /** @summary The vdom child ids as the action left them, before any update or settle pass. */
    lastVdomIds = null

    /** @summary Applies one batch of `[recordId, tier]` edits inside one task, then records the vdom. */
    afterSetAction(value) {
        value?.changes?.forEach(([id, tier]) => { this.store.get(id).tier = tier });
        this.lastVdomIds = this.getVdomRoot().cn.map(node => node.id)
    }

    /** @summary Addresses an item by its record, never by its position. */
    getItemId(recordOrId) {
        return `${this.id}__item-${recordOrId?.isRecord ? this.getRecordId(recordOrId) : recordOrId}`
    }

    /** @summary Resolves the numeric record key from an item id. */
    getItemRecordId(id) {
        return Number(id.slice(this.id.length + '__item-'.length))
    }

    /** @summary Reuses one card per record and seats the pool in Store order. */
    createItemContent(record, index) {
        let me   = this,
            pool = me.items || [],
            key  = me.getRecordId(record),
            text = `${record.name} · tier ${record.tier}`,
            card = pool.find(item => item.record && me.getRecordId(item.record) === key),
            seat;

        if (card) {
            card.setSilent({record, text})
        } else {
            card = Neo.create(Card, {
                appName: me.appName, windowId: me.windowId, parentId: me.id, id: `${me.id}__card-${key}`, record, text
            });
            pool.push(card)
        }

        seat = pool.indexOf(card);

        if (seat !== index && index < pool.length) {
            [pool[index], pool[seat]] = [pool[seat], pool[index]]
        }

        me.items       = pool;
        me.updateDepth = -1;

        return [card.createVdomReference()]
    }

    /** @summary Orders the record-owned pool by the sorted records without renaming a card. */
    sortItems({items}) {
        let me = this;

        if (me.items) {
            const sorted = items.map(record => me.items.find(card => card.record === record)).filter(Boolean);

            me.items       = sorted.concat(me.items.filter(card => !sorted.includes(card)));
            me.updateDepth = -1
        }
    }

    /** @summary The App worker's view: Store order plus the vdom and vnode child ids and transforms. */
    get observation() {
        const read = nodes => (nodes || []).map(node => ({id: node.id, transform: node.style?.transform}));

        return {
            lastVdomIds: this.lastVdomIds,
            order      : this.store.items.map(record => record.id),
            vdom       : read(this.getVdomRoot().cn),
            vnode      : read(this.vnode?.childNodes)
        }
    }
}
List = Neo.setupClass(List);

export const onStart = () => {
    const store = Neo.create(Store, {
        keyProperty: 'id',
        model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}, {name: 'tier', type: 'Integer'}]},
        sorters    : [{property: 'tier', direction: 'ASC'}, {property: 'name', direction: 'ASC'}],
        data       : records()
    });

    // Registered before the list's listeners, like the Fleet roster controller's: a sort key edit re-sorts
    store.on('recordChange', ({fields}) => {
        fields.some(field => field.name === 'tier') && store.doSort()
    });

    Neo.app({
        name    : 'RecordChangeResortTestApp',
        mainView: {
            module: Viewport,
            id    : 'record-change-resort-viewport',
            items : [{module: List, id: 'record-change-resort-list', width: 640, height: 260, store}]
        }
    })
};
