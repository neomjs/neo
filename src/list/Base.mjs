import {default as ClassSystemUtil} from '../util/ClassSystem.mjs';
import {default as Collection}      from '../collection/Base.mjs';
import {default as Component}       from '../component/Base.mjs';
import ListModel                    from '../selection/ListModel.mjs';
import NeoArray                     from '../util/Array.mjs';
import Store                        from '../data/Store.mjs';

/**
 * @class Neo.list.Base
 * @extends Neo.component.Base
 */
class Base extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.Base'
         * @private
         */
        className: 'Neo.list.Base',
        /**
         * @member {String} ntype='list'
         * @private
         */
        ntype: 'list',
        /**
         * True will destroy the used collection / store when the component gets destroyed
         * @member {Boolean} autoDestroyStore=true
         */
        autoDestroyStore: true,
        /**
         * @member {String[]} cls=['neo-list-container','neo-list']
         */
        cls: ['neo-list-container', 'neo-list'],
        /**
         * @member {Boolean} disableSelection_=false
         */
        disableSelection_: false,
        /**
         * @member {String} displayField='name'
         */
        displayField: 'name',
        /**
         * @member {Boolean} highlightFilterValue=true
         */
        highlightFilterValue: true,
        /**
         * @member {String} itemCls='neo-list-item'
         */
        itemCls: 'neo-list-item',
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {},
        /**
         * Either pass a selection.Model module, an instance or a config object
         * @member {Object|Neo.selection.Model} selectionModel_=null
         */
        selectionModel_: null,
        /**
         * Set this to true in case a select event should only update _vdom (e.g. when used inside a form.field.Select
         * @member {Boolean} silentSelect=false
         */
        silentSelect: false,
        /**
         * @member {Neo.data.Store|null} store_=null
         */
        store_: null,
        /**
         * True will add a checkbox in front of each list item
         * @member {Boolean} stacked_=true
         */
        useCheckBoxes_: false,
        /**
         * @member {Object} _vdom={tag:'ul',cn:[]}
         */
        _vdom: {
            tag: 'ul',
            cn : []
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            domListeners = me.domListeners;

        domListeners.push({
            click: {fn: me.onClick, scope: me}
        });

        me.domListeners = domListeners;
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.selectionModel) {
            me.selectionModel.register(me);
        }
    }

    /**
     * Triggered after the disableSelection config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetDisableSelection(value, oldValue) {
        let me = this;

        if (value && me.rendered && me.selectionModel) {
            me.selectionModel.deselectAll();
        }
    }

    /**
     * Triggered after the selectionModel config got changed
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @private
     */
    afterSetSelectionModel(value, oldValue) {
        if (this.rendered) {
            value.register(this);
        }
    }

    /**
     * Triggered after the store config got changed
     * @param {Neo.data.Store} value
     * @param {Neo.data.Store} oldValue
     * @private
     */
    afterSetStore(value, oldValue) {
        let me = this;

        if (value) {
            value.on({
                filter: me.onStoreFilter,
                load  : me.onStoreLoad,
                scope : me
            });

            if (value.getCount() > 0) {
                me.onStoreLoad();
            }
        }
    }

    /**
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @returns {Neo.selection.Model}
     * @private
     */
    beforeSetSelectionModel(value, oldValue) {
        if (oldValue) {
            oldValue.destroy();
        }

        return ClassSystemUtil.beforeSetInstance(value, ListModel);
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @private
     */
    beforeSetStore(value, oldValue) {
        if (oldValue) {
            oldValue.destroy();
        }

        return ClassSystemUtil.beforeSetInstance(value);
    }

    /**
     * Triggered after the useCheckBoxes config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetUseCheckBoxes(value, oldValue) {
        let me  = this,
            cls = me.cls;

        NeoArray[value ? 'add' : 'remove'](cls, 'neo-use-checkicons');
        me.cls = cls;
    }

    /**
     * Override this method for custom list items
     * @param {Object} record
     */
    createItem(record) {
        let me = this;

        return {
            tag     : 'li',
            cls     : [me.itemCls],
            html    : me.createItemContent(record),
            id      : me.getItemId(record[me.getKeyProperty()]),
            tabIndex: -1
        };
    }

    /**
     * Override this method for custom renderers
     * @param {Object} record
     */
    createItemContent(record) {
        let me       = this,
            itemText = record[this.displayField],
            filter;

        if (me.highlightFilterValue) {
            filter = me.store.getFilter(me.displayField);

            if (filter && filter.value !== null && filter.value !== '') {
                itemText = itemText.replace(new RegExp(filter.value, 'gi'), function(match) {
                    return '<span class="neo-highlight-search">' + match + '</span>';
                });
            }
        }

        return itemText;
    }

    /**
     * @param {Boolean} [silent=false]
     */
    createItems(silent=false) {
        let me   = this,
            vdom = me.vdom;

        vdom.cn = [];

        me.store.items.forEach((item, index) => {
            vdom.cn.push(me.createItem(item));
        });

        if (silent) {
            me._vdom = vdom;
        } else {
            me.promiseVdomUpdate().then(() => {
                me.fire('createItems');
            });
        }
    }

    /**
     *
     */
    destroy() {
        let me = this;

        if (me.selectionModel) {
            me.selectionModel.destroy();
        }

        if (me.store && me.autoDestroyStore) {
            me.store.destroy();
        }

        super.destroy();
    }

    /**
     *
     * @param {Number|String} id
     * @returns {String}
     */
    getItemId(id) {
        return this.id + '__' + id;
    }

    /**
     *
     * @param {String} vnodeId
     * @returns {String|Number} itemId
     */
    getItemRecordId(vnodeId) {
        let itemId   = vnodeId.split('__')[1],
            model    = this.store.model,
            keyField = model && model.getField(model.keyProperty);

        if (keyField && keyField.type.toLowerCase() === 'number') {
            itemId = parseInt(itemId);
        }

        return itemId;
    }

    /**
     * Support collections & stores
     * @returns {String}
     */
    getKeyProperty() {
        return this.store.keyProperty || this.store.model.keyProperty;
    }

    /**
     *
     * @param {Object} data
     */
    onClick(data) {
        let me = this;

        if (data.path[0].id === me.id) {
            me.onContainerClick(data);
        }  else if (data.path[0].cls.includes(me.itemCls)) {
            me.onItemClick(data);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onContainerClick(data) {
        /**
         * The containerClick event fires when a click occurs on the component, but not on a list item
         * @event containerClick
         * @param {String[]} cls the classList of the target node (converted to an array)
         * @param {String} id the target dom id
         * @param {String[]} path the event path
         * @returns {Object}
         */
        this.fire('containerClick', data);
    }

    /**
     *
     * @param {Object} data
     */
    onItemClick(data) {
        let me     = this,
            nodeId = data.path[0].id;

        if (!me.disableSelection && me.selectionModel) {
            me.selectionModel.select(nodeId);
        }

        /**
         * The itemClick event fires when a click occurs on a list item
         * @event itemClick
         * @param {String} id the record matching the list item
         * @returns {Object}
         */
        me.fire('itemClick', me.store.get(me.getItemRecordId(nodeId)));
    }

    /**
     *
     */
    onStoreFilter() {
        this.createItems();
    }

    /**
     *
     */
    onStoreLoad() {
        this.createItems();
    }

    /**
     * Convenience shortcut
     * @param {Number} index
     */
    selectItem(index) {
        let me = this;

        if (!me.disableSelection && me.selectionModel) {
            me.selectionModel.selectAt(index);
        }
    }
}

Neo.applyClassConfig(Base);

export {Base as default};