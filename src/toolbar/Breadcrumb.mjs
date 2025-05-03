import ClassSystemUtil from '../util/ClassSystem.mjs';
import HashHistory     from '../util/HashHistory.mjs';
import Store           from '../data/Store.mjs';
import Toolbar         from './Base.mjs';

/**
 * @class Neo.toolbar.Breadcrumb
 * @extends Neo.toolbar.Base
 */
class Breadcrumb extends Toolbar {
    static config = {
        /**
         * @member {String} className='Neo.toolbar.Breadcrumb'
         * @protected
         */
        className: 'Neo.toolbar.Breadcrumb',
        /**
         * @member {String} ntype='breadcrumb-toolbar'
         * @protected
         */
        ntype: 'breadcrumb-toolbar',
        /**
         * @member {Number|String|null} activeKey_=null
         */
        activeKey_: null,
        /**
         * @member {String[]} baseCls=['neo-breadcrumb-toolbar','neo-toolbar']
         */
        baseCls: ['neo-breadcrumb-toolbar', 'neo-toolbar'],
        /**
         * @member {Object} itemDefaults={ntype:'button', ui: 'tertiary'}
         */
        itemDefaults: {
            ntype: 'button',
            ui   : 'tertiary'
        },
        /**
         * @member {Neo.data.Store|Object} store_=null
         */
        store_: null
    }

    /**
     * @member {Object} defaultStoreConfig
     */
    defaultStoreConfig = {
        module: Store,

        model: {
            fields: [{
                name: 'id',
                type: 'Integer'
            }, {
                name: 'name',
                type: 'String'
            }, {
                name: 'parentId',
                type: 'Integer'
            }, {
                name: 'route', // Each route has to end with a '/'. E.g.: '/home/accessibility/'
                type: 'String'
            }]
        }
    }
    /**
     * @member {Boolean} updateOnHashChange=true
     */
    updateOnHashChange = true

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.updateOnHashChange && HashHistory.on('change', me.onHashChange, me)
    }

    /**
     * Triggered after the activeKey config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetActiveKey(value, oldValue) {
        let me = this,
            route;

        if (value !== null && me.store.getCount?.() > 0) {
            me.updateItems();

            route = me.store.get(value)?.route;

            route && Neo.Main.setRoute({value: route})
        }
    }

    /**
     * Triggered after the store config got changed
     * @param {Neo.data.Store|Object} value
     * @param {Neo.data.Store|Object} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        value.on({
            load : this.onStoreLoad,
            scope: this
        })
    }

    /**
     * Triggered before the store config gets changed
     * @param {Neo.data.Store|Object} value
     * @param {Neo.data.Store|Object} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        oldValue?.destroy();
        return ClassSystemUtil.beforeSetInstance(value, null, this.defaultStoreConfig)
    }

    /**
     *
     */
    destroy(...args) {
        let me = this;

        me.updateOnHashChange && HashHistory.un('change', me.onHashChange, me);

        super.destroy(...args)
    }

    /**
     * @returns {Object[]}
     */
    getPathItems() {
        let items    = [],
            parentId = this.activeKey,
            {store}  = this,
            item;

        while (parentId !== null) {
            item = store.get(parentId);

            items.unshift(item);

            parentId = item.parentId
        }

        return items
    }

    /**
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHashChange(value, oldValue) {
        let hashString = value?.hashString,
            {store}    = this,
            activeKey;

        if (hashString && !hashString.endsWith('/')) {
            hashString += '/'
        }

        activeKey = hashString && store.findFirst({route: hashString})?.[store.keyProperty] || null;

        if (activeKey !== null) {
            this.activeKey = activeKey
        }
    }

    /**
     * @param {Object[]} items
     */
    onStoreLoad(items) {
       this.afterSetActiveKey(this.activeKey, null)
    }

    /**
     *
     */
    updateItems() {
        let me        = this,
            {items}   = me,
            pathItems = me.getPathItems(),
            i         = 0,
            len       = pathItems.length,
            newItems  = [],
            config, item

        me.silentVdomUpdate = true;

        for (; i < len; i++) {
            item = pathItems[i];

            config = {
                disabled : i === len - 1,
                editRoute: false,
                hidden   : false,
                route    : item.route,
                text     : item.name
            };

            if (items[i]) {
                items[i].setSilent(config)
            } else {
                newItems.push(config)
            }
        }

        len = items.length;

        for (; i < len; i++) {
            items[i].setSilent({
                hidden: true
            })
        }

        newItems.length > 0 && me.add(newItems);

        me.silentVdomUpdate = false;

        me.update()
    }
}

export default Neo.setupClass(Breadcrumb);
