import ClassSystemUtil from '../../../util/ClassSystem.mjs';
import ChipComponent   from '../../../component/Chip.mjs';
import ChipList        from '../../../list/Chip.mjs';
import Store           from '../../../data/Store.mjs';

/**
 * The selected-value projection owned by {@link Neo.form.field.Chip}.
 *
 * @summary Renders selected keys through `list.Chip` over the field's Store instance without
 * copying records or taking Store ownership. Filtering the picker never hides an already-selected
 * chip: lookup uses the Store's unfiltered `allItems` collection when present.
 *
 * @class Neo.form.field.chip.ValueList
 * @extends Neo.list.Chip
 */
class ValueList extends ChipList {
    static config = {
        /**
         * @member {String} className='Neo.form.field.chip.ValueList'
         * @protected
         */
        className: 'Neo.form.field.chip.ValueList',
        /**
         * The field owns the shared Store; this projection never destroys it.
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * @member {String[]} cls=['neo-chip-field-values']
         * @reactive
         */
        cls: ['neo-chip-field-values'],
        /**
         * Chips are value affordances, not a second selection model.
         * @member {Boolean} disableSelection=true
         */
        disableSelection: true,
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module         : ChipComponent,
            iconCls        : null,
            useDomListeners: false
        },
        /**
         * Whether chip removal is currently allowed by the owning field.
         * @member {Boolean} removable_=true
         * @reactive
         */
        removable_: true,
        /**
         * Store keys to render, in field-value order.
         * @member {Array} selectedKeys_=[]
         * @reactive
         */
        selectedKeys_: [],
        /**
         * Chips flow horizontally and wrap inside the field.
         * @member {Boolean} stacked=false
         * @reactive
         */
        stacked: false
    }

    /**
     * @summary Uses one list-level close-button listener because component-list items are VDOM references;
     * their per-instance DOM listener is not an event-routing boundary.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.addDomListeners({
            click   : this.onChipCloseClick,
            delegate: 'neo-chip-close-button',
            scope   : this
        })
    }

    /**
     * @summary Does not destroy the previous Store: every Store assigned here is field-owned and shared.
     * @param {Object|Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store|null}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        return value === null ? null : ClassSystemUtil.beforeSetInstance(value, Store)
    }

    /**
     * @summary Detaches shared-Store listeners before the inherited list wiring attaches the replacement.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        oldValue && this.detachStore(oldValue);

        super.afterSetStore(value, oldValue);
        value?.on('mutate', this.onStoreMutate, this)
    }

    /**
     * @summary Updates existing chip affordances when the owning field becomes read-only or disabled.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetRemovable(value, oldValue) {
        this.items?.forEach(item => item.set({
            closable: value,
            disabled: !value
        }))
    }

    /**
     * @summary Re-renders the selected-key projection.
     * @param {Array} value
     * @param {Array} oldValue
     * @protected
     */
    afterSetSelectedKeys(value, oldValue) {
        oldValue !== undefined && this.store && this.createItems()
    }

    /**
     * @summary Adds record identity, accessible removal text, and one semantic removal listener to a chip.
     * @param {Object} record
     * @param {Number} index
     * @returns {Object[]}
     */
    createItemContent(record, index) {
        let me        = this,
            oldItem   = me.items?.[index],
            result    = super.createItemContent(record, index),
            item      = me.items[index],
            recordKey = me.store.getKey(record);

        if (!oldItem) {
            item.on('remove', me.onChipRemove, me)
        }

        item.set({
            closable   : me.removable,
            disabled   : !me.removable,
            removeLabel: `Remove ${record[me.displayField]}`,
            value      : recordKey
        });

        return result
    }

    /**
     * @summary Renders only selected records and retires unused components after their removal delta settles.
     * @param {Boolean} silent=false
     */
    createItems(silent=false) {
        let me      = this,
            source  = me.store?.allItems || me.store,
            records = (me.selectedKeys || []).map(key => source?.get(key)).filter(Boolean),
            vdom    = me.getVdomRoot(),
            listItem;

        vdom.cn = [];

        records.forEach((record, index) => {
            listItem = me.createItem(record, index);
            listItem && vdom.cn.push(listItem)
        });

        !silent && me.promiseUpdate().then(() => {
            if (!me.isDestroyed) {
                me.trimRenderedItems();
                me.fire('createItems')
            }
        })
    }

    /**
     * @summary Resolves item ids against the unfiltered Store so picker filtering cannot create `-1` ids.
     * @param {Number|String} recordId
     * @returns {String}
     */
    getItemId(recordId) {
        const source = this.store?.allItems || this.store;

        return `${this.id}__${source.indexOf(recordId)}`
    }

    /**
     * @summary A subset projection cannot patch by the source Store index; rebuild its bounded row instead.
     * @protected
     */
    onStoreRecordChange() {
        this.createItems()
    }

    /**
     * @summary Rebuilds the bounded selected subset instead of applying ComponentList's full-Store remap.
     * @protected
     */
    onStoreSort() {
        this.createItems()
    }

    /**
     * @summary Retires items only after this exact VNode flight has stopped referencing them.
     * @param {Object} data
     * @param {Set<String>|null} mergedChildIds
     * @protected
     */
    resolveVdomUpdate(data, mergedChildIds) {
        this.trimRenderedItems();
        super.resolveVdomUpdate(data, mergedChildIds)
    }

    /**
     * @summary Trims only items absent from both the DOM-confirmed VNode and the current desired VDOM.
     * @protected
     */
    trimRenderedItems() {
        let me = this;

        if (me.isDestroyed) {
            return
        }

        let renderedCount = Math.max(me.vnode?.childNodes?.length || 0, me.vdom.cn.length);

        while (me.items?.length > renderedCount) {
            me.items.pop().destroy()
        }
    }

    /**
     * @summary Source replacement/mutation convergence for the shared Store.
     * @protected
     */
    onStoreMutate() {
        this.createItems()
    }

    /**
     * @summary Routes a chip's semantic removal intent to the owning field.
     * @param {Object} data
     * @param {*} data.value
     * @protected
     */
    onChipRemove({value}) {
        this.fire('removevalue', {source: this, value})
    }

    /**
     * @summary Resolves the nested component and routes pointer activation through its semantic remove path.
     * @param {Object} data
     * @protected
     */
    onChipCloseClick(data) {
        const
            chipNode = data.path.find(node => (Array.isArray(node.cls) ? node.cls : node.cls?.split(/\s+/))?.includes('neo-chip')),
            chip     = chipNode && Neo.getComponent(chipNode.id);

        chip?.onCloseButtonClick(data)
    }

    /**
     * @summary Removes every inherited/shared Store listener without destroying the Store.
     * @param {Neo.data.Store} store
     * @protected
     */
    detachStore(store) {
        store.un({
            filter      : 'onStoreFilter',
            load        : 'onStoreLoad',
            recordChange: 'onStoreRecordChange',
            sort        : 'onStoreSort',
            scope       : this
        });
        store.un('mutate', this.onStoreMutate, this)
    }

    /**
     * @summary Detaches shared-Store listeners before component/list teardown.
     */
    destroy(...args) {
        this.store && this.detachStore(this.store);
        super.destroy(...args)
    }
}

/**
 * Fired when one projected chip requests removal.
 * @event removevalue
 * @param {Neo.form.field.chip.ValueList} source
 * @param {*} value
 */

export default Neo.setupClass(ValueList);
