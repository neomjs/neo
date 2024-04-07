import Component  from '../component/Base.mjs';
import LayoutBase from '../layout/Base.mjs';
import LayoutCard from '../layout/Card.mjs';
import LayoutFit  from '../layout/Fit.mjs';
import LayoutGrid from '../layout/Grid.mjs';
import LayoutHbox from '../layout/HBox.mjs';
import LayoutVBox from '../layout/VBox.mjs';
import Logger     from '../util/Logger.mjs';
import NeoArray   from '../util/Array.mjs';

const byWeight = ({ weight : lhs = 0 }, { weight : rhs = 0 }) => lhs - rhs;

/**
 * @class Neo.container.Base
 * @extends Neo.component.Base
 */
class Base extends Component {
    static config = {
        /**
         * @member {String} className='Neo.container.Base'
         * @protected
         */
        className: 'Neo.container.Base',
        /**
         * @member {String} ntype='container'
         * @protected
         */
        ntype: 'container',
        /**
         * @member {String[]} baseCls=['neo-container']
         */
        baseCls: ['neo-container'],
        /**
         * @member {Object} itemDefaults_=null
         */
        itemDefaults_: null,
        /**
         * An array or an object of config objects|instances|modules for each child component
         * @member {Object[]} items_=[]
         * @example
         * import Button      from '../button/Base.mjs';
         * import Toolbar     from '../toolbar/Base.mjs';
         *
         * let myButton = Neo.create(Button, {
         *     text: 'Button1'
         * });
         *
         * Neo.create(Toolbar, {
         *     //...
         *     items: {
         *         buttonRef : {
         *             ntype: 'button',   // by ntype
         *             text : 'Button 2'
         *         },
         *         secondRef : {
         *             module: Button,    // by imported module
         *             text  : 'Button 3'
         *         }
         *     }
         * });
         *
         * or
         * @example
         * import Button      from '../button/Base.mjs';
         * import MyRedButton from 'myapp/MyRedButton.mjs';
         * import Toolbar     from '../toolbar/Base.mjs';
         *
         * let myButton = Neo.create(Button, {
         *     text: 'Button1'
         * });
         *
         * Neo.create(Toolbar, {
         *     //...
         *     items: [
         *         myButton,              // passed instance
         *         {
         *             ntype: 'button',   // by ntype
         *             text : 'Button 2'
         *         },
         *         {
         *             module: Button,    // by imported module
         *             text  : 'Button 3'
         *         },
         *         MyRedButton            // you can drop imported modules directly into the items array
         *     ]
         * });
         */
        items_: [],
        /**
         * @member {Object} layout_={ntype: 'vbox', align: 'stretch'}
         */
        layout_: {
            ntype: 'vbox',
            align: 'stretch'
        },
        /**
         * @member {Object} _vdom={cn: []}
         */
        _vdom:
        {cn: []}
    }

    /**
     * Inserts an item or array of items at the last index
     * @param {Object|Array} item
     * @returns {Neo.component.Base|Neo.component.Base[]}
     */
    add(item) {
        let me = this;
        return me.insert(me.items ? me.items.length : 0, item)
    }

    /**
     * Triggered after the appName config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        let me = this;

        super.afterSetAppName(value, oldValue);

        if (value && me.items) {
            me.items.forEach(item => {
                if (Neo.isObject(item)) {
                    item.appName = value
                }
            })
        }

        if (value && me.layout) {
            me.layout.appName = value
        }
    }

    /**
     * @param {Neo.layout.Base} value
     * @param {Neo.layout.Base} oldValue
     * @protected
     */
    afterSetLayout(value, oldValue) {
        let me = this;

        if (me.rendered) {
            oldValue.removeRenderAttributes();
            value.applyRenderAttributes();

            me.items.forEach((item, index) => {
                oldValue.removeChildAttributes(item, index);
                value.applyChildAttributes(item, index)
            })
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        if (oldValue !== undefined) {
            super.afterSetMounted(value, oldValue);

            for (let i = 0, { items } = this, { length } = items; i < length; i++) {
                if (!items[i].vdom.removeDom) {
                    items[i].mounted = value
                }
            }
        }
    }

    /**
     * Triggered after the needsVdomUpdate config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetNeedsVdomUpdate(value, oldValue) {
        if (!value) {
            this.items?.forEach(item => {
                // check for e.g. Toolbar items like '->'
                if (typeof item !== 'string') {
                    // we can not set the config directly => it could already be false,
                    // and we still want to pass it further into subtrees
                    item._needsVdomUpdate = false;
                    item.afterSetNeedsVdomUpdate?.(false, true)
                }
            })
        }
    }

    /**
     * Triggered after the rendering config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetRendering(value, oldValue) {
        if (oldValue !== undefined) {
            let items = this.items,
                i     = 0,
                len   = items.length;

            for (; i < len; i++) {
                if (!items[i].vdom.removeDom) {
                    items[i].rendering = value
                }
            }
        }
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        let me = this;

        value && me.items?.forEach(item => {
            if (Neo.isObject(item)) {
                item.windowId = value
            }
        })

        if (value && me.layout) {
            me.layout.windowId = value
        }
    }

    /**
     * Convert items object to an array for onward storage as _items
     * @param {Object|Object[]} value
     * @param {Object|Object[]} oldValue
     * @returns {Object[]}
     * @protected
     */
     beforeSetItems(value, oldValue) {
        if (Neo.typeOf(value) === 'Object') {
            const result = [];

            let hasWeight;

            for (const ref in value) {
                const item = value[ref]

                item.reference = ref;
                result.push(item);
                hasWeight ||= ('weight' in item);
            }

            if (hasWeight) {
                result.sort(byWeight);
            }
            value = result;
        }

        return value;
    }

    /**
     * @param {Object|String} value
     * @param {Object|String|Neo.layout.Base} oldValue
     * @returns {Neo.layout.Base}
     * @protected
     */
    beforeSetLayout(value, oldValue) {
        return this.createLayout(value)
    }

    /**
     * @param {*} item
     * @param {Number} index
     * @returns {Neo.component.Base|Object} Object for lazy loaded items
     */
    createItem(item, index) {
        let me       = this,
            config   = {appName: me.appName, parentId: me.id, parentIndex: index, windowId: me.windowId},
            defaults = {...me.itemDefaults},
            lazyLoadItem, module;

        if (defaults) {
            if (item.module) {
                delete defaults.ntype;
            }

            if (item.ntype) {
                delete defaults.module;
            }
        }

        switch (Neo.typeOf(item)) {
            case 'NeoClass': {
                item = Neo.create({
                    ...defaults,
                    module: item,
                    ...config
                });
                break;
            }

            case 'NeoInstance': {
                item.set(config);

                // In case an item got created outside a VC or VM based hierarchy, there might be bindings or string
                // based listeners which still need to get resolved.
                item.getController()?.parseConfig(item);
                item.getModel()     ?.parseConfig(item);
                break;
            }

            case 'Object': {
                if (defaults) {
                    Neo.assignDefaults(item, defaults)
                }

                if (!item.module && !item.ntype && !item.className) {
                    item.module = Component
                }

                module = item.module;

                lazyLoadItem = module && !module.isClass && Neo.isFunction(module);

                if (module && !lazyLoadItem) {
                    item.className = module.prototype.className
                }

                if (item.handlerScope === 'this') {
                    item.handlerScope = me;

                    if (Neo.typeOf(item.handler) === 'String' && Neo.typeOf(me[item.handler]) === 'Function') {
                        item.handler = me[item.handler]
                    }
                }

                Object.assign(item, config);

                if (!lazyLoadItem) {
                    item = Neo[item.className ? 'create' : 'ntype'](item)
                } else {
                    item.vdom = Object.assign(item.vdom || {}, {removeDom: true})
                }

                break;
            }

            case 'String': {
                item = Neo.create({
                    module: Component,
                    vdom  : {innerHTML: item},
                    ...config
                });

                break;
            }
        }

        return item
    }

    /**
     * @protected
     */
    createItems() {
        let me        = this,
            items     = me._items,
            itemsRoot = me.getVdomItemsRoot(),
            layout    = me.layout;

        itemsRoot.cn = [];

        items.forEach((item, index) => {
            items[index] = item = me.createItem(item, index);

            if (item instanceof Neo.core.Base) {
                layout.applyChildAttributes(item, index)
            }

            itemsRoot.cn.push(item.vdom)
        });

        me.update()
    }

    /**
     * @param {Object|String|Neo.layout.Base} value
     * @protected
     * @returns {Neo.layout.Base}
     */
    createLayout(value) {
        let me = this;

        if (value) {
            if (value instanceof LayoutBase && value.isLayout) {
                value.appName     = me.appName;
                value.containerId = me.id;
                value.windowId    = me.windowId;
            } else {
                value = me.parseLayoutClass(value);
                value.appName     = me.appName;
                value.containerId = me.id;
                value.windowId    = me.windowId;
                value = Neo.ntype(value)
            }
        }

        return value
    }

    /**
     * Destroys all components inside this.items before the super() call.
     * @param {Boolean} [updateParentVdom=false] true to remove the component from the parent vdom => real dom
     * @param {Boolean} [silent=false] true to update the vdom silently (useful for destroying multiple child items in a row)
     */
    destroy(updateParentVdom=false, silent=false) {
        this.items?.forEach(item => {
            item.destroy?.(false, true)
        });

        super.destroy(updateParentVdom, silent)
    }

    /**
     * An alternative for `getReference()` which is useful before a component tree got created.
     * `getReference()` relies on child items being registered inside `manager.Component`,
     * while this method simply walks down the items array.
     *
     * However, classes / modules inside the items tree can not get parsed further.
     * @param {String} reference
     * @param {Object[]} items=this.items
     * @returns {Object|Neo.component.Base|null}
     */
    getItem(reference, items=this.items) {
        let i   = 0,
            len = items.length,
            item,
            childItem;

        for (; i < len; i++) {
            item = items[i];
            if (item.reference === reference) {
                return item
            } else if (item.items) {
                childItem = this.getItem(reference, item.items);

                if (childItem) {
                    return childItem
                }
            }
        }

        return null
    }

    /**
     * Specify a different vdom items root if needed (useful in case this container uses a wrapper node).
     * @returns {Object} The new vdom items root
     */
    getVdomItemsRoot() {
        return this.getVdomRoot()
    }

    /**
     * Finds the index of a direct child component inside this.items.
     * @param {Neo.component.Base|String} itemId Either the item reference or the item id
     * @returns {Number} -1 in case no match was found
     */
    indexOf(itemId) {
        let me  = this,
            i   = 0,
            len = me.items?.length || 0;

        if (!Neo.isString(itemId)) {
            itemId = itemId.id;
        }

        for (; i < len; i++) {
            if (me.items[i].id === itemId) {
                return i
            }
        }

        return -1
    }

    /**
     * Inserts an item or array of items at a specific index
     * @param {Number} index
     * @param {Object|Array} item
     * @param {Boolean} [silent=false]
     * @returns {Neo.component.Base|Neo.component.Base[]}
     */
    insert(index, item, silent=false) {
        let me    = this,
            items = me.items,
            i, len, returnArray;

        if (Array.isArray(item)) {
            i           = 0;
            len         = item.length;
            returnArray = [];

            for (; i < len; i++) {
                // insert the array backwards
                returnArray.unshift(me.insert(index, item[len - 1 - i], true))
            }

            item = returnArray;
        } else {
            item = me.createItem(item, index);

            // added the true param => for card layouts, we do not want a dynamically inserted cmp to get removed right away
            // since it will most likely get activated right away
            me.layout.applyChildAttributes(item, index, true);

            items.splice(index, 0, item);

            me.items = items;

            me.getVdomItemsRoot().cn.splice(index, 0, item.vdom)
        }

        if (!silent) {
            me.promiseUpdate().then(() => {
                me.fire('insert', { index, item })
            })
        }

        return item;
    }

    /**
     *
     */
    mergeConfig(...args) {
        let me     = this,
            config = super.mergeConfig(...args);

        // avoid any interference on prototype level
        // does not clone existing Neo instances

        if (config.itemDefaults) {
            me._itemDefaults = Neo.clone(config.itemDefaults, true, true);
            delete config.itemDefaults
        }

        if (config.items) {
            // If we are passed an object, merge the class's own items object into it
            if (Neo.typeOf(config.items) === 'Object') {
                me.items = Neo.merge(Neo.clone(me.constructor.config.items), config.items)
            } else {
                me._items = Neo.clone(config.items, true, true)
            }
            delete config.items
        }

        return config
    }

    /**
     * Moves an existing item to a new index
     * @param {Number} fromIndex
     * @param {Number} toIndex
     * @returns {Neo.component.Base}
     */
    moveTo(fromIndex, toIndex) {
        let me   = this,
            item = me.items[fromIndex];

        fromIndex !== toIndex && me.switchItems(toIndex, fromIndex);

        return item
    }

    /**
     *
     */
    onConstructed() {
        let me = this;

        // in case the Container does not have a layout config, the setter won't trigger
        me._layout = me.createLayout(me.layout);
        me._layout.applyRenderAttributes();

        super.onConstructed();

        me.parseItemConfigs(me.items);
        me.createItems()
    }

    /**
     * @param {Object|String} config
     * @protected
     * @returns {Object} layoutConfig
     */
    parseLayoutClass(config) {
        if (Neo.isObject(config)) {
            if (config.ntype.indexOf('layout-') < 0) {
                config.ntype = 'layout-' + config.ntype
            }
        } else if (config.indexOf('layout-') < 0) {
            config = {
                ntype: 'layout-' + config
            }
        } else {
            config = {
                ntype: config
            }
        }

        return config
    }

    /**
     * Removes a container item by reference
     * @param {Neo.component.Base} component
     * @param {Boolean} [destroyItem=true]
     * @param {Boolean} [silent=false]
     * @returns {Neo.component.Base|null}
     */
    remove(component, destroyItem=true, silent=false) {
        let items = [...this.items],
            i     = 0,
            len   = items.length;

        for (; i < len; i++) {
            if (items[i].id === component.id) {
                this.removeAt(i, destroyItem, silent)
            }
        }
    }

    /**
     * Clears the item array
     * @param {Boolean} destroyItems=true
     * @param {Boolean} silent=false
     */
    removeAll(destroyItems=true, silent=false) {
        let me = this;

        me.items.forEach(item => {
            if (destroyItems) {
                item.destroy(true, true)
            } else {
                item.mounted = false
            }
        });

        me.items = [];

        me.getVdomItemsRoot().cn = [];

        if (!silent || destroyItems) {
            me.update()
        }
    }

    /**
     * Removes a container item at a given index
     * @param {Number} index
     * @param {Boolean} destroyItem=true
     * @param {Boolean} silent=false
     * @returns {Neo.component.Base|null}
     */
    removeAt(index, destroyItem=true, silent=false) {
        let me    = this,
            items = me.items,
            vdom  = me.vdom,
            item;

        if (index >= items.length) {
            Neo.warn('Container.removeAt: index >= items.length. ' + me.id)
        } else {
            item = items[index];

            items.splice(index, 1);

            me.getVdomItemsRoot().cn.splice(index, 1);

            me[silent || destroyItem ? '_vdom' : 'vdom'] = vdom;

            if (destroyItem) {
                item.destroy(true, silent);
                return null
            } else {
                item.mounted = false;
                return item
            }
        }
    }

    /**
     * Removes the container item at the last index
     * @param {Boolean} [destroyItem=true]
     * @param {Boolean} [silent=false]
     */
    removeLast(destroyItem=true, silent=false) {
        this.removeAt(this.items.length - 1, destroyItem, silent)
    }

    /**
     * Replaces a container item at a given index
     * @param {Number} index
     * @param {Neo.component.Base} item
     * @param {Boolean} destroyItem=true
     * @param {Boolean} silent=false
     */
    replaceAt(index, item, destroyItem=true, silent=false) {
        this.removeAt(index, destroyItem, true);
        this.insert(index, item, silent)
    }

    /**
     * Switches the position of 2 direct child items
     * You can either pass an index (Number) or id (String)
     * @param {Number|String} item1id
     * @param {Number|String} item2id
     */
    switchItems(item1id, item2id) {
        let me         = this,
            item1Index = Neo.isNumber(item1id) ? item1id : me.indexOf(item1id),
            item2Index = Neo.isNumber(item2id) ? item2id : me.indexOf(item2id);

        NeoArray.move(me.items,                 item2Index, item1Index);
        NeoArray.move(me.getVdomItemsRoot().cn, item2Index, item1Index);

        me.update()
    }
}

Neo.setupClass(Base);

export default Base;
