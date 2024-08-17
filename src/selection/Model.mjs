import Base       from '../core/Base.mjs';
import NeoArray   from '../util/Array.mjs';
import Observable from '../core/Observable.mjs';

/**
 * @class Neo.selection.Model
 * @extends Neo.core.Base
 */
class Model extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.selection.Model'
         * @protected
         */
        className: 'Neo.selection.Model',
        /**
         * @member {String} ntype='selection-model'
         * @protected
         */
        ntype: 'selection-model',
        /**
         * Placeholder for extended classes to add a custom css rule to this owner component
         * @member {String|null} cls=null
         * @protected
         */
        cls: null,
        /**
         * @member {Array} items_=null
         * @protected
         */
        items_: null,
        /**
         * @member {String} selectedCls='selected'
         */
        selectedCls: 'neo-selected',
        /**
         * @member {Boolean} singleSelect=true
         */
        singleSelect: true,
        /**
         * Internally saves the view id, but the getter will return the matching instance
         * @member {Object} view_=null
         * @protected
         */
        view_: null
    }

    /**
     * Gets triggered before getting the value of the items config
     * @param {Array|null} value
     * @returns {Array}
     */
    beforeGetItems(value) {
        if (!value) {
            this._items = value = []
        }

        return value
    }

    /**
     * Gets triggered before getting the value of the view config
     * @param {String} value
     * @returns {Neo.component.Base}
     */
    beforeGetView(value) {
        return Neo.getComponent(this._view)
    }

    /**
     * Gets triggered before setting the value of the view config
     * @returns {String} the view id
     */
    beforeSetView(value) {
        return value && value.id
    }

    /**
     *
     */
    addDomListener() {}

    /**
     * @param {Object} item
     * @param {Boolean} [silent] true to prevent a vdom update
     * @param {Object[]|String[]} itemCollection=this.items
     * @param {String} [selectedCls]
     */
    deselect(item, silent, itemCollection=this.items, selectedCls) {
        // We hold vdom ids for now, so all incoming selections must be converted.
        item = item.isRecord ? view.getItemId(item) : Neo.isObject(item) ? item.id : item;

        if (itemCollection.includes(item)) {
            let me     = this,
                {view} = me,
                node   = view.getVdomChild(item);

            if (node) {
                node.cls = NeoArray.remove(node.cls || [], selectedCls || me.selectedCls);
                node['aria-selected'] = false
            }

            NeoArray.remove(itemCollection, item);

            if (!silent) {
                view.update();

                me.fire('selectionChange', {
                    selection: itemCollection
                })
            }
        }
        else if (!silent) {
            this.fire('noChange')
        }
    }

    /**
     * @param {Boolean} [silent] true to prevent a vdom update
     */
    deselectAll(silent) {
        let me     = this,
            items  = [...me.items],
            {view} = me;

        if (items.length) {
            items.forEach(item => {
                me.deselect(item, true)
            });

            if (!silent && items.length > 0) {
                view.update()
            }

            me.fire('selectionChange', {
                selection: this.items
            })
        }
        else if (!silent) {
            me.fire('noChange')
        }
    }

    /**
     *
     */
    destroy(...args) {
        this.unregister();
        super.destroy(...args)
    }

    /**
     * @returns {Array} this.items
     */
    getSelection() {
        return this.items
    }

    /**
     * @returns {Boolean} true in case there is a selection
     */
    hasSelection() {
        return this.items.length > 0
    }

    /**
     * @param {String} id
     * @returns {Boolean} true in case the item is selected
     */
    isSelected(id) {
        return this.items.includes(id)
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        let me  = this,
            cls = component.cls || [];

        if (me.cls && !cls.includes(me.cls)) {
            cls.push(me.cls);
            component.cls = cls
        }

        me.view = component;
        me.addDomListener()
    }

    /**
     *
     */
    removeDomListeners() {
        let me           = this,
            component    = me.view,
            domListeners = [...component.domListeners];

        component.domListeners.forEach(listener => {
            if (listener.scope === me) {
                NeoArray.remove(domListeners, listener)
            }
        });

        component.domListeners = domListeners
    }

    /**
     * @param {Object|Object[]|String[]} items
     * @param {Object[]|String[]} itemCollection=this.items
     * @param {String} [selectedCls]
     */
    select(items, itemCollection=this.items, selectedCls) {
        let me     = this,
            {view} = me;

        // We hold vdom ids for now, so all incoming selections must be converted.
        items = (items = Array.isArray(items) ?
            items: [items]).map(item => item.isRecord ? view.getItemId(item) : Neo.isObject(item) ? item.id : item);

        if (!Neo.isEqual(itemCollection, items)) {
            if (me.singleSelect) {
                me.deselectAll(true)
            }

            items.forEach((node, i) => {
                node = view.getVdomChild(node);

                if (node) {
                    node.cls = NeoArray.add(node.cls || [], selectedCls || me.selectedCls);
                    node['aria-selected'] = true
                }
            });

            NeoArray.add(itemCollection, items);

            !view.silentSelect && view.update();

            view.onSelect?.(items);

            me.fire('selectionChange', {
                selection: itemCollection
            })
        }
        else {
            me.fire('noChange')
        }
    }

    /**
     * @param {Object} item
     */
    toggleSelection(item) {
        let me = this;

        if (me.isSelected(item)) {
            me.deselect(item)
        } else {
            me.select(item)
        }
    }

    /**
     *
     */
    unregister() {
        let me  = this,
            cls = me.view.cls || [];

        if (me.cls && cls.includes(me.cls)) {
            NeoArray.remove(cls, me.cls);
            me.view.cls = cls
        }

        me.deselectAll();

        me.removeDomListeners()
    }
}

export default Neo.setupClass(Model);
