import Component      from '../component/Base.mjs';
import LayoutBase     from '../layout/Base.mjs';
import LayoutCard     from '../layout/Card.mjs';
import LayoutFit      from '../layout/Fit.mjs';
import LayoutGrid     from '../layout/Grid.mjs';
import LayoutHbox     from '../layout/HBox.mjs';
import LayoutVBox     from '../layout/VBox.mjs';
import Logger         from '../util/Logger.mjs';
import NeoArray       from '../util/Array.mjs';
import {isDescriptor} from '../core/ConfigSymbols.mjs';

const byWeight = ({ weight : lhs = 0 }, { weight : rhs = 0 }) => lhs - rhs;

/**
 * @class Neo.container.Base
 * @extends Neo.component.Base
 */
class Container extends Component {
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
         * @member {Boolean} dragResortable_=false
         * @reactive
         */
        dragResortable_: false,
        /**
         * Default configuration for child items within this container.
         * This config uses a descriptor to enable deep merging with instance based itemDefaults.
         * @member {Object} itemDefaults_={[isDescriptor]: true, merge: 'deep', value: null}
         * @reactive
         */
        itemDefaults_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : null
        },
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
         * @reactive
         */
        items_: {
            [isDescriptor]: true,
            clone         : 'shallow',
            cloneOnGet    : 'none',
            isEqual       : () => false,
            value         : []
        },
        /**
         * @member {Object|String|null} layout_={ntype: 'vbox', align: 'stretch'}
         * @reactive
         */
        layout_: {
            ntype: 'vbox',
            align: 'stretch'
        },
        /**
         * @member {Neo.draggable.container.SortZone|null} sortZone=null
         */
        sortZone: null,
        /**
         * @member {String} sortZoneCls='Neo.draggable.container.SortZone'
         */
        sortZoneCls: 'Neo.draggable.container.SortZone',
        /**
         * @member {Object} sortZoneConfig=null
         */
        sortZoneConfig: null,
        /**
         * @member {Object} _vdom={cn: []}
         */
        _vdom:
        {cn: []}
    }

    /**
     * Inserts an item or array of items at the last index
     * @param {Object|Array} item
     * @param {Boolean} [silent=false]
     * @param {Boolean} [removeFromPreviousParent=true]
     * @returns {Neo.component.Base|Neo.component.Base[]}
     */
    add(item, silent=false, removeFromPreviousParent=true) {
        let me = this;
        return me.insert(me.items ? me.items.length : 0, item, silent, removeFromPreviousParent)
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
                if (!Neo.isString(item)) {
                    item.appName = value
                }
            })
        }

        if (value && me.layout) {
            me.layout.appName = value
        }

        if (me.sortZone) {
            me.sortZone.appName = value
        }
    }

    /**
     * @param {Neo.layout.Base|null} value
     * @param {Neo.layout.Base|null} oldValue
     * @protected
     */
    afterSetLayout(value, oldValue) {
        let me = this;

        if (me.vnodeInitialized) {
            oldValue?.removeRenderAttributes();
            value?.applyRenderAttributes();

            me.items.forEach((item, index) => {
                oldValue?.removeChildAttributes(item, index);
                value?.applyChildAttributes(item, index)
            })
        }

        oldValue?.destroy?.()
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

            for (let i = 0, {items} = this, {length} = items; i < length; i++) {
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
     * Triggered after the vnodeInitializing config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsVnodeInitializing(value, oldValue) {
        if (oldValue !== undefined) {
            let {items} = this,
                i       = 0,
                len     = items.length;

            for (; i < len; i++) {
                if (!items[i].vdom.removeDom) {
                    items[i].isVnodeInitializing = value
                }
            }
        }
    }

    /**
     * Triggered after the dragResortable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetDragResortable(value, oldValue) {
        let me = this,
            module;

        if (value && !me.sortZone) {
            if (me.sortZoneConfig?.module) {
                module = me.sortZoneConfig.module;

                if (!me.isConstructed) {
                    await Promise.resolve()
                }
            } else {
                module = await me.loadSortZoneModule();
                module = module.default
            }

            me.createSortZone(Neo.merge({
                module,
                appName            : me.appName,
                boundaryContainerId: me.id,
                owner              : me,
                windowId           : me.windowId
            }, me.sortZoneConfig))
        }
    }

    /**
     * Triggered after the theme config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);

        value && this.items?.forEach(item => {
            if (!Neo.isString(item)) {
                item.theme = value
            }
        })
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        let me       = this,
            {layout} = me;

        value && me.items?.forEach(item => {
            if (!Neo.isString(item)) {
                item.windowId = value
            }
        })

        if (value && layout && !Neo.isString(layout)) {
            layout.windowId = value
        }

        if (me.sortZone) {
            me.sortZone.windowId = value
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
            let result = [],
                hasWeight, item;

            for (const ref in value) {
                item = value[ref]

                item.reference = ref;
                result.push(item);
                hasWeight ||= ('weight' in item)
            }

            if (hasWeight) {
                result.sort(byWeight)
            }

            value = result
        }

        return value
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
     * @param {Boolean} [removeFromPreviousParent=true]
     * @returns {Neo.component.Base|Object} Object for lazy loaded items
     */
    createItem(item, index, removeFromPreviousParent=true) {
        let me       = this,
            config   = {appName: me.appName, parentId: me.id, parentIndex: index, windowId: me.windowId},
            defaults = {...me.itemDefaults},
            lazyLoadItem, module, parent;

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
                    theme: item.config.theme || me.theme,
                    ...defaults,
                    module: item,
                    ...config
                });
                break
            }

            case 'NeoInstance': {
                parent = item.parent;

                if (parent && parent !== me) {
                    if (removeFromPreviousParent) {
                        parent.remove?.(item, false);
                        delete item.vdom.removeDom
                    }

                    if (parent.windowId !== me.windowId) {
                        // In case we are duplicating vdom into a different browser window, we need a silent
                        // _mounted update to ensure that afterSetMounted() still gets triggered.
                        item[removeFromPreviousParent ? 'mounted' : '_mounted'] = false
                    }

                    // Convenience logic, especially for moving components into different browser windows:
                    // A component might rely on references & handler methods inside the previous controller realm
                    // todo: We need ?. until functional.component.Base supports controllers
                    if (!item.controller && !me.getController() && parent.getController?.()) {
                        item.controller = {parent: parent.getController()}
                    }
                }

                item.set(config);
                item.getStateProvider?.()?.createBindings(item);
                break
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
                    item.className = module.prototype.className;
                    item.theme     = defaults.theme || module.config.theme || me.theme
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

                break
            }

            case 'String': {
                item = Neo.create({
                    module: Component,
                    vdom  : {text: item},
                    ...config
                });

                break
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
            {layout}  = me,
            vdom;

        itemsRoot.cn = [];

        items.forEach((item, index) => {
            items[index] = item = me.createItem(item, index);

            if (item instanceof Neo.core.Base) {
                layout?.applyChildAttributes(item, index);
                vdom = item.createVdomReference()
            } else {
                vdom = item.vdom
            }

            itemsRoot.cn.push(vdom)
        });

        // We need to add items into the vdom
        me.updateDepth = -1;
        me.isConstructed && me.update();

        me.fire('itemsCreated', {id: me.id, items})
    }

    /**
     * @param {Object|String|Neo.layout.Base} value
     * @protected
     * @returns {Neo.layout.Base}
     */
    createLayout(value) {
        if (value) {
            let me                      = this,
                {appName, id, windowId} = me;

            if (value instanceof LayoutBase && value.isLayout) {
                Object.assign(value, {appName, containerId: id, windowId})
            } else {
                value = me.parseLayoutClass(value);
                Object.assign(value, {appName, containerId: id, windowId});
                value = Neo.ntype(value)
            }
        }

        return value
    }

    /**
     * @param {Object} config
     */
    createSortZone(config) {
        this.sortZone = Neo.create(config)
    }

    /**
     * Destroys all components inside this.items before the super() call.
     * @param {Boolean} [updateParentVdom=false] true to remove the component from the parent vdom => real dom
     * @param {Boolean} [silent=false] true to update the vdom silently (useful for destroying multiple child items in a row)
     */
    destroy(updateParentVdom=false, silent=false) {
        this.layout?.destroy();

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
            childItem, item;

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
     * Inserts an item or array of items at a specific index.
     *
     * **Atomic Moves:**
     * If the `item` is an existing `Neo.component.Base` instance that already has a parent container
     * within the same browser window, this method performs an **atomic move**.
     * 1. The item is silently removed from its old parent (without triggering a DOM removal).
     * 2. The item is inserted into this container.
     * 3. This container updates, sending an `insertNode` delta.
     * 4. The `DeltaUpdates` system detects the existing DOM node and moves it physically, preserving
     *    DOM state such as focus, input values, and iframe content.
     *
     * @param {Number} index
     * @param {Array|Object|Neo.component.Base} item
     * @param {Boolean} [silent=false]
     * @param {Boolean} [removeFromPreviousParent=true]
     * @returns {Neo.component.Base|Neo.component.Base[]}
     */
    insert(index, item, silent=false, removeFromPreviousParent=true) {
        let me          = this,
            {items}     = me,
            lca         = null,
            i, itemParent, itemType, len, oldParent, parentsA, parentsB, returnArray;

        if (Array.isArray(item)) {
            i           = 0;
            len         = item.length;
            returnArray = [];

            for (; i < len; i++) {
                // insert the array backwards
                returnArray.unshift(me.insert(index, item[len - 1 - i], true, removeFromPreviousParent))
            }

            item = returnArray
        } else {
            itemType = Neo.typeOf(item);

            if (itemType === 'NeoInstance') {
                itemParent = item.parent;

                if (itemParent === me && items.indexOf(item) === index) {
                    return item
                }

                if (itemParent && itemParent !== me && removeFromPreviousParent) {
                    oldParent = itemParent;

                    if (oldParent.windowId === me.windowId) {
                        parentsA = [me,        ...me.getParents()];
                        parentsB = [oldParent, ...oldParent.getParents()];

                        lca = parentsA.find(p => parentsB.includes(p))
                    }

                    if (lca) {
                        oldParent.remove(item, false, true, true);
                        removeFromPreviousParent = false
                    }
                }
            }

            item = me.createItem(item, index, removeFromPreviousParent);

            // added the true param => for card layouts, we do not want a dynamically inserted cmp to get removed right away
            // since it will most likely get activated right away
            me.layout?.applyChildAttributes(item, index, true);

            items.splice(index, 0, item);

            me.items = items;

            me.getVdomItemsRoot().cn.splice(index, 0, item.createVdomReference())
        }

        if (!silent) {
            (lca || me).updateDepth = -1; // pass the full vdom tree to honor new nested component trees

            (lca || me).promiseUpdate().then(() => {
                me.fire('insert', {index, item})
            })
        }

        return item;
    }

    /**
     * Load items from a remote endpoint.
     * See: https://github.com/neomjs/neo/tree/dev/examples/serverside
     * The response should return a JSON file in the following format:
     * {"modules": [], "items": []}
     * See: https://github.com/neomjs/neo/blob/dev/examples/serverside/gridContainer/resources/data/grid-container.json
     * It is important to add modules which are not already imported inside your app yet.
     * @param {Object} data
     * @param {Object} [data.options={}]
     * @param {String} data.url
     * @returns {Promise<Object[]>}
     */
    async loadItems({options={}, url}) {
        let me         = this,
            response   = await me.trap(fetch(url, options)),
            remoteData = await me.trap(response.json());

        if (remoteData.modules?.length > 0) {
            await me.trap(Promise.all(remoteData.modules.map(modulePath => {
                // Adjust relative URLs
                if (!modulePath.startsWith('http')) {
                    modulePath = (Neo.config.environment === 'development' ? '../../' : '../../../../') + modulePath
                }

                return import(/* webpackIgnore: true */ modulePath)
            })))
        }

        return remoteData.items
    }

    /**
     * @returns {Promise<any>}
     */
    loadSortZoneModule() {
        return import('../draggable/container/SortZone.mjs')
    }

    /**
     *
     */
    mergeConfig(...args) {
        let me     = this,
            config = super.mergeConfig(...args),
            ctorItems;

        // Avoid any interference on prototype level
        // Does not clone existing Neo instances
        if (config.items) {
            ctorItems = me.constructor.config.items;

            // If we are passed an object, merge the class's own items object into it
            if (Neo.typeOf(config.items) === 'Object') {
                if (Neo.isArray(ctorItems)) {
                    me.items = Neo.clone(config.items, true, true)
                } else {
                    me.items = Neo.merge(Neo.clone(ctorItems), config.items)
                }
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
        let me           = this,
            layoutConfig = me.layout;

        // If the layout is a config object (not an instance), deep clone it
        // to prevent prototype pollution.
        if (layoutConfig && !(layoutConfig instanceof LayoutBase)) {
            layoutConfig = Neo.clone(layoutConfig, true)
        }

        // in case the Container does not have a layout config, the setter won't trigger
        me._layout = me.createLayout(layoutConfig);
        me._layout?.applyRenderAttributes();

        super.onConstructed();

        me.parseItemConfigs(me._items);
        me.createItems()
    }

    /**
     * @param {Object|String} config
     * @protected
     * @returns {Object} layoutConfig
     */
    parseLayoutClass(config) {
        if (Neo.isObject(config)) {
            if (!config.ntype.startsWith('layout-')) {
                config.ntype = `layout-${config.ntype}`
            }
        } else {
            config = {
                ntype: config.startsWith('layout-') ? config : `layout-${config}`
            }
        }

        return config
    }

    /**
     * Removes a container item by reference
     * @param {Neo.component.Base} component
     * @param {Boolean} [destroyItem=true]
     * @param {Boolean} [silent=false]
     * @param {Boolean} [keepMounted=false]
     * @returns {Neo.component.Base|null}
     */
    remove(component, destroyItem=true, silent=false, keepMounted=false) {
        let items = [...this.items],
            i     = 0,
            len   = items.length;

        for (; i < len; i++) {
            if (items[i].id === component.id) {
                return this.removeAt(i, destroyItem, silent, keepMounted)
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
     * Removes a container item at a given index.
     *
     * @param {Number} index
     * @param {Boolean} destroyItem=true
     * @param {Boolean} silent=false
     * @param {Boolean} keepMounted=false Set to `true` to keep the item's `mounted` state as `true`.
     * This is critical for **Atomic Moves**, where the item is removed from one container and immediately added
     * to another, and we do not want to trigger unmount lifecycle hooks in between.
     * @returns {Neo.component.Base|null}
     */
    removeAt(index, destroyItem=true, silent=false, keepMounted=false) {
        let me      = this,
            {items} = me,
            item;

        if (index >= items.length) {
            Neo.warn('Container.removeAt: index >= items.length. ' + me.id)
        } else {
            item = items[index];

            items.splice(index, 1);

            me.getVdomItemsRoot().cn.splice(index, 1);

            // the next update cycle needs to include direct children
            me.updateDepth = 2;

            !silent && me.update();

            if (destroyItem) {
                item.destroy(true, silent);
                return null
            } else {
                me.layout?.removeChildAttributes(item);
                if (!keepMounted) {
                    item.mounted = false
                }
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

        // the next update cycle needs to include direct children
        me.updateDepth = 2;

        me.update()
    }

    /**
     * Serializes the container into a JSON-compatible object.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            dragResortable: me.dragResortable,
            itemCount     : me.items?.length || 0,
            itemDefaults  : me.itemDefaults,
            items         : me.items?.map(item => {
                const itemType = Neo.typeOf(item);

                if (itemType === 'NeoInstance') {
                    return item.id
                }

                if (itemType === 'Object') {
                    if (Neo.isFunction(item.module) && !item.module.isClass) {
                        return {
                            ...item,
                            module: item.module.toString()
                        }
                    }
                }

                return me.serializeConfig(item)
            }),
            layout: me.layout?.toJSON()
        }
    }
}

export default Neo.setupClass(Container);
