import Base       from '../core/Base.mjs';
import NeoArray   from '../util/Array.mjs';
import Observable from '../core/Observable.mjs';

/**
 * @class Neo.selection.Model
 * @extends Neo.core.Base
 */
class Model extends Base {
    static getStaticConfig() {return {
        /**
         * True automatically applies the core/Observable.mjs mixin
         * @member {Boolean} observable=true
         * @static
         */
        observable: true
    }}

    static getConfig() {return {
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
         * @member {Array} items=[]
         * @protected
         */
        items: [],
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
    }}

    /**
     * Gets triggered before getting the value of the view config
     * @returns {Neo.component.Base}
     */
    beforeGetView() {
        return Neo.getComponent(this._view);
    }

    /**
     * Gets triggered before setting the value of the view config
     * @returns {String} the view id
     */
    beforeSetView(value) {
        return value && value.id;
    }

    /**
     *
     */
    addDomListener() {}

    /**
     *
     * @param {Object} item
     * @param {Boolean} [silent] true to prevent a vdom update
     * @param {Array} [itemCollection]
     * @param {String} [selectedCls]
     */
    deselect(item, silent, itemCollection, selectedCls) {
        let me   = this,
            view = me.view,
            vdom = view.vdom,
            node = view.getVdomChild(item), // todo: support for nodes (right now limited to ids)
            cls;

        if (node) {
            cls = node.cls || [];
            NeoArray.remove(cls, selectedCls || me.selectedCls);
            node.cls = cls;
        }

        NeoArray.remove(itemCollection || me.items, item);

        if (!silent) {
            view.vdom = vdom;
        }
    }

    /**
     *
     * @param {Boolean} [silent] true to prevent a vdom update
     */
    deselectAll(silent) {
        let me    = this,
            items = [...me.items],
            view  = me.view,
            vdom  = view.vdom;

        items.forEach(item => {
            me.deselect(item, true);
        });

        if (!silent && items.length > 0) {
            view.vdom = vdom;
        }
    }

    /**
     *
     */
    destroy() {
        this.unregister();
        super.destroy();
    }

    /**
     *
     * @returns {Array} this.items
     */
    getSelection() {
        return this.items;
    }

    /**
     *
     * @returns {Boolean} true in case there is a selection
     */
    hasSelection() {
        return this.items.length > 0;
    }

    /**
     *
     * @param {String} id
     * @returns {Boolean} true in case the item is selected
     */
    isSelected(id) {
        return this.items.indexOf(id) > -1;
    }

    /**
     *
     * @param {Neo.component.Base} component
     */
    register(component) {
        let me  = this,
            cls = component.cls || [];

        if (me.cls && !cls.includes(me.cls)) {
            cls.push(me.cls);
            component.cls = cls;
        }

        me.view = component;
        me.addDomListener();
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
                NeoArray.remove(domListeners, listener);
            }
        });

        component.domListeners = domListeners;
    }

    /**
     *
     * @param {Object|Object[]|String[]} items
     * @param {Array} [itemCollection]
     * @param {String} [selectedCls]
     */
    select(items, itemCollection, selectedCls) {
        items = Array.isArray(items) ? items : [items];

        let me   = this,
            view = me.view,
            vdom = view.vdom,
            cls;

        if (me.singleSelect) {
            me.deselectAll(true);
        }

        items.forEach(node => {
            if (typeof node === 'string') {
                node = view.getVdomChild(node);
            }

            if (node) {
                cls = node.cls || [];
                NeoArray.add(cls, selectedCls || me.selectedCls);
                node.cls = cls;
            }
        });

        NeoArray.add(itemCollection || me.items, items);

        view[view.hasOwnProperty('silentSelect') && view.silentSelect === true ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     *
     * @param {Object} item
     */
    toggleSelection(item) {
        let me = this;

        if (me.isSelected(item)) {
            me.deselect(item);
        } else {
            me.select(item);
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
            me.view.cls = cls;
        }

        me.deselectAll();

        me.removeDomListeners();
    }
}

Neo.applyClassConfig(Model);

export {Model as default};