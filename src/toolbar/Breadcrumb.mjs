import ClassSystemUtil from '../util/ClassSystem.mjs';
import HashHistory     from '../util/HashHistory.mjs';
import Store           from '../data/Store.mjs';
import Toolbar         from './Base.mjs';

/**
 * @summary Renders hierarchical route trails inside a WAI-ARIA `<nav>` landmark with `aria-current="page"` on the active crumb.
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
         * @reactive
         */
        activeKey_: null,
        /**
         * Accessible label applied to the `<nav>` landmark root (`null` omits `aria-label`).
         * @member {String|null} ariaLabel_='Breadcrumb'
         * @reactive
         */
        ariaLabel_: 'Breadcrumb',
        /**
         * @member {String[]} baseCls=['neo-breadcrumb-toolbar','neo-toolbar']
         */
        baseCls: ['neo-breadcrumb-toolbar', 'neo-toolbar'],
        /**
         * @member {Object} itemDefaults={ntype:'button', ui: 'tertiary'}
         * @reactive
         */
        itemDefaults: {
            ntype: 'button',
            ui   : 'tertiary'
        },
        /**
         * @member {Neo.data.Store|Object} store_=null
         * @reactive
         */
        store_: null,
        /**
         * @member {String} tag='nav'
         * @reactive
         */
        tag: 'nav'
    }

    /**
     * True while adopting an already-populated Store instance whose initial `load` microtask already settled.
     * @type {Boolean}
     * @private
     */
    #adoptLoadedStore = false
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

        if (value !== null && me.store?.getCount?.() > 0) {
            me.updateItems();

            route = me.store.get(value)?.route;

            route && Neo.Main.setRoute({value: route})
        } else if (value === null && oldValue !== undefined && me.items?.length > 0) {
            me.updateItems()
        }
    }

    /**
     * Syncs `aria-label` on the `<nav>` landmark root.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAriaLabel(value, oldValue) {
        this.changeVdomRootKey('aria-label', value)
    }

    /**
     * Triggered after the store config got changed
     * @param {Neo.data.Store|Object|null} value
     * @param {Neo.data.Store|Object|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me = this;

        if (value) {
            value.on({
                load : me.onStoreLoad,
                scope: me
            });

            if (oldValue !== undefined && me.#adoptLoadedStore) {
                me.#adoptLoadedStore = false;
                me.onStoreLoad()
            }
        }
    }

    /**
     * Triggered before the store config gets changed
     * @param {Neo.data.Store|Object} value
     * @param {Neo.data.Store|Object} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        oldValue && oldValue !== value && oldValue.destroy?.();
        this.#adoptLoadedStore = Neo.typeOf(value) === 'NeoInstance' && value.getCount?.() > 0;
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
            item, seen;

        if (!store || parentId === null || parentId === undefined) {
            return items
        }

        seen = new Set();

        while (parentId !== null && parentId !== undefined) {
            if (seen.has(parentId)) {
                break
            }

            seen.add(parentId);
            item = store.get(parentId);

            if (!item) {
                break
            }

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

        activeKey = (hashString && store?.findFirst({route: hashString})?.[store.keyProperty]) ?? null;

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
     * Reconciles reused and newly added route buttons in one dense Depth-2 VDOM pass.
     */
    updateItems() {
        let me        = this,
            {items}   = me,
            pathItems = me.getPathItems(),
            i         = 0,
            len       = pathItems.length,
            newItems  = [],
            config, item;

        me.silentVdomUpdate = true;

        for (; i < len; i++) {
            item = pathItems[i];

            config = {
                ariaCurrent: i === len - 1 ? 'page' : null,
                disabled   : i === len - 1,
                hidden     : false,
                route      : item.route,
                text       : item.name
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
                ariaCurrent: null,
                hidden     : true
            })
        }

        newItems.length > 0 && me.add(newItems);

        me.silentVdomUpdate = false;

        if (me.updateDepth !== -1) {
            me.updateDepth = 2
        }

        me.denseUpdate = true;

        me.update()
    }
}

export default Neo.setupClass(Breadcrumb);
