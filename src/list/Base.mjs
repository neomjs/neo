import ClassSystemUtil from '../util/ClassSystem.mjs';
import Component       from '../component/Base.mjs';
import ListModel       from '../selection/ListModel.mjs';
import NeoArray        from '../util/Array.mjs';
import Store           from '../data/Store.mjs';

/**
 * @class Neo.list.Base
 * @extends Neo.component.Base
 */
class Base extends Component {
    static config = {
        /**
         * @member {String} className='Neo.list.Base'
         * @protected
         */
        className: 'Neo.list.Base',
        /**
         * @member {String} ntype='list'
         * @protected
         */
        ntype: 'list',
        /**
         * @member {Boolean} animate_=false
         */
        animate_: false,
        /**
         * True will destroy the used collection / store when the component gets destroyed
         * @member {Boolean} autoDestroyStore=true
         */
        autoDestroyStore: true,
        /**
         * @member {String[]} baseCls=['neo-list']
         */
        baseCls: ['neo-list'],
        /**
         * An optional record field to make items non-clickable and visually greyed out.
         * The field expects the Boolean type.
         * @member {String} disabledField='disabled'
         */
        disabledField: 'disabled',
        /**
         * @member {Boolean} disableSelection_=false
         */
        disableSelection_: false,
        /**
         * @member {String} displayField='name'
         */
        displayField: 'name',
        /**
         * @member {Boolean} draggable_=false
         */
        draggable_: false,
        /**
         * @member {Neo.draggable.list.DragZone|null} dragZone=null
         */
        dragZone: null,
        /**
         * @member {Object} dragZoneConfig=null
         */
        dragZoneConfig: null,
        /**
         * Keeps track of the focussed item index and allows bindings and programmatic changes.
         * You can either pass the index or the related record
         * @member {Number|Object|null} focusIndex_=null
         */
        focusIndex_: null,
        /**
         * In case we are using list item headers and want to bind list item indexes to e.g. a card layout
         * for e.g. a sidenav, this config comes in handy.
         * @member {Number|null} headerlessSelectedIndex_=null
         */
        headerlessSelectedIndex_: null,
        /**
         * @member {Boolean} highlightFilterValue=true
         */
        highlightFilterValue: true,
        /**
         * @member {String} itemCls='neo-list-item'
         */
        itemCls: 'neo-list-item',
        /**
         * Defaults to px
         * @member {Number|null} itemHeight_=null
         */
        itemHeight_: null,
        /**
         * The type of the node / tag for each list item
         * @member {String} itemTagName='li'
         */
        itemTagName: 'li',
        /**
         * Defaults to px
         * @member {Number|null} itemWidth_=null
         */
        itemWidth_: null,
        /**
         * @member {Boolean} itemsFocusable=true
         */
        itemsFocusable: true,
        /**
         * The config will get passed to the navigator main thread addon.
         * E.g. for ComboBoxes, which shall preserve their focussed list item when filtering the store, use true.
         * @member {Boolean} keepFocusIndex=false
         */
        keepFocusIndex: false,
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {},
        /**
         * config values for Neo.list.plugin.Animate
         * @member {Object} pluginAnimateConfig=null
         */
        pluginAnimateConfig: null,
        /**
         * Keeps track of the selected item index and allows bindings and programmatic changes
         * @member {Number|null} selectedIndex_=null
         */
        selectedIndex_: null,
        /**
         * Either pass a selection.Model module, an instance or a config object
         * @member {Object|Neo.selection.Model} selectionModel_=null
         */
        selectionModel_: null,
        /**
         * Set this to true in case a keyboard navigation should immediately select the focussed item
         * @member {Boolean} selectOnFocus=false
         */
        selectOnFocus: false,
        /**
         * Set this to true in case a select event should only update _vdom (e.g. when used inside a form.field.ComboBox
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
         * Setting this config to true will switch to dl, dt & dd tags instead of using ul & li.
         * Use the {Boolean} model field isHeader.
         * @member {Boolean} useHeaders_=false
         */
        useHeaders_: false,
        /**
         * @member {Boolean} useWrapperNode_=false
         */
        useWrapperNode_: false,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'ul', cn: []}
    }

    /**
     * @member {String|null} itemRole=null
     */
    itemRole = null
    /**
     * An object to help configure the navigation. Used to pass to {@link Neo.main.addon.Navigator#subscribe}.
     * @member {Object} navigator={}
     */
    navigator = {}
    /**
     * Defaults to false in case useHeaders is set to true
     * @member {Boolean} scrollIntoViewOnFocus=true
     */
    scrollIntoViewOnFocus = true

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (me.useHeaders) {
            me.scrollIntoViewOnFocus = false
        }

        me.addDomListeners({
            click: me.onClick,
            scope: me
        })
    }

    /**
     * Triggered after the animate config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetAnimate(value, oldValue) {
        if (value && !this.getPlugin('list-animate')) {
            import('./plugin/Animate.mjs').then(module => {
                let me      = this,
                    plugins = me.plugins || [];

                plugins.push({
                    module  : module.default,
                    appName : me.appName,
                    windowId: me.windowId,
                    ...me.pluginAnimateConfig
                });

                me.plugins = plugins
            })
        }
    }

    /**
     * Triggered after the disableSelection config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisableSelection(value, oldValue) {
        value && this.rendered && this.selectionModel?.deselectAll()
    }

    /**
     * Triggered after the draggable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDraggable(value, oldValue) {
        let me = this;

        if (value && !me.dragZone) {
            import('../draggable/list/DragZone.mjs').then(module => {
                me.dragZone = Neo.create({
                    module  : module.default,
                    appName : me.appName,
                    owner   : me,
                    windowId: me.windowId,
                    ...me.dragZoneConfig
                })
            })
        }
    }

    /**
     * Triggered after the focusIndex config got changed
     * @param {Number|Object|null} value
     * @param {Number|Object|null} oldValue
     * @protected
     */
    afterSetFocusIndex(value, oldValue) {
        let me = this;

        if (Neo.isNumber(value)) {
            Neo.main.addon.Navigator.navigateTo([me.getHeaderlessIndex(value), me.navigator])
        } else if (value) {
            Neo.main.addon.Navigator.navigateTo([me.getItemId(value[me.getKeyProperty()]), me.navigator])
        }
    }

    /**
     * Triggered after the headerlessSelectedIndex config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetHeaderlessSelectedIndex(value, oldValue) {
        let me = this;

        if (Neo.isNumber(value)) {
            me.selectedIndex = me.store.getCount() ? me.getSelectedIndex(value) : null
        } else if (Neo.isNumber(oldValue)) {
            me.selectedIndex = null
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        let me = this;

        // Tear down navigation before we lose the element
        if (!value && me.hasNavigator) {
            Neo.main.addon.Navigator.unsubscribe(me.navigator);

            me.hasNavigator  = false;
            me.selectedIndex = null
        }

        if (value) {
            // Set up item navigation in the list
            if (!me.hasNavigator) {
                me.navigator = {
                    appName       : me.appName,
                    autoClick     : me.selectOnFocus,
                    id            : me.id,
                    keepFocusIndex: me.keepFocusIndex,
                    selector      : `.${me.itemCls}:not(.neo-disabled,.neo-list-header)`,
                    windowId      : me.windowId,
                    ...me.navigator
                };

                me.hasNavigator = true
            }

            Neo.main.addon.Navigator.subscribe(me.navigator)
        }

        super.afterSetMounted(value, oldValue)
    }

    /**
     * Triggered after the selectedIndex config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetSelectedIndex(value, oldValue) {
        let me               = this,
            {selectionModel} = me;

        if (Neo.isNumber(value)) {
            selectionModel?.selectAt(value);
            me.headerlessSelectedIndex = me.getHeaderlessIndex(value)
        } else if (Neo.isNumber(oldValue)) {
            selectionModel.deselectAll();
            me.headerlessSelectedIndex = null
        }
    }

    /**
     * Triggered after the selectionModel config got changed
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        this.rendered && value.register(this)
    }

    /**
     * Triggered after the store config got changed
     * @param {Neo.data.Store} value
     * @param {Neo.data.Store} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me = this;

        value?.on({
            filter      : 'onStoreFilter',
            load        : 'onStoreLoad',
            recordChange: 'onStoreRecordChange',
            sort        : 'onStoreSort',
            scope       : me
        });

        value?.getCount() > 0 && me.onStoreLoad()
    }

    /**
     * Triggered after the useCheckBoxes config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseCheckBoxes(value, oldValue) {
        let me    = this,
            {cls} = me;

        NeoArray.toggle(cls, 'neo-use-checkicons', !!value);
        me.cls = cls
    }

    /**
     * Triggered after the useHeaders config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseHeaders(value, oldValue) {
        if (value) {
            let me = this;

            me.vdom.tag = 'dl';
            me.itemTagName = 'dd'
        }
    }

    /**
     * Triggered after the useWrapperNode config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseWrapperNode(value, oldValue) {
        let me                = this,
            {cls, wrapperCls} = me;

        NeoArray[value ? 'add' : 'remove'](cls, 'neo-use-wrapper-node');
        NeoArray[value ? 'add' : 'remove'](wrapperCls, 'neo-list-wrapper');

        me.wrapperCls = wrapperCls;
        me.cls        = cls
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        let {navigator} = this;

        if (navigator) {
            navigator.windowId = value
        }
    }

    /**
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @returns {Neo.selection.Model}
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        oldValue?.destroy();
        return ClassSystemUtil.beforeSetInstance(value, ListModel)
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        oldValue?.destroy();
        return ClassSystemUtil.beforeSetInstance(value, Store)
    }

    /**
     * Override this method for custom list items
     * @param {Object} record
     * @param {Number} index
     * @returns {Object} The list item vdom object
     */
    createItem(record, index) {
        let me               = this,
            cls              = [me.itemCls],
            hasItemHeight    = me.itemHeight !== null,
            hasItemWidth     = me.itemWidth !== null,
            isHeader         = me.useHeaders && record.isHeader,
            itemContent      = me.createItemContent(record, index),
            itemId           = me.getItemId(record[me.getKeyProperty()]),
            {selectionModel} = me,
            isSelected       = !me.disableSelection && selectionModel?.isSelected(itemId),
            item, removeDom;

        isHeader && cls.push('neo-list-header');

        if (isSelected){
            cls.push(selectionModel.selectedCls)
        }

        if (record.cls) {
            NeoArray.add(cls, record.cls)
        }

        if (record[me.disabledField]) {
            cls.push('neo-disabled')
        }

        item = {
            id  : itemId,
            tag : isHeader ? 'dt' : me.itemTagName,
            'aria-selected' : isSelected,
            cls
        };

        if (me.itemsFocusable) {
            item.tabIndex = -1
        }

        if (record.hidden || itemContent.removeDom) {
            item.removeDom = true
        }

        if (me.itemRole) {
            item.role = me.itemRole
        }

        switch (Neo.typeOf(itemContent)) {
            case null: {
                return null
            }

            case 'Array': {
                item.cn = itemContent;

                removeDom = true;

                itemContent.forEach(item => {
                    if (!item.removeDom) {
                        removeDom = false
                    }
                })

                if (removeDom) {
                    item.removeDom = true
                }

                break
            }

            case 'Object': {
                // We want a merge for custom cls rules
                if (itemContent.cls) {
                    NeoArray.add(item.cls, itemContent.cls);
                    delete itemContent.cls
                }

                Object.assign(item, itemContent);
                break
            }

            case 'Number':
            case 'String': {
                item.html = itemContent;
                break
            }
        }

        if (hasItemHeight || hasItemWidth) {
            item.style = item.style || {};

            if (hasItemHeight && !item.hasOwnProperty('height')) {
                item.style.height = `${me.itemHeight}px`
            }

            if (hasItemWidth && !item.hasOwnProperty('width')) {
                item.style.width = `${me.itemWidth}px`
            }
        }

        return item
    }

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        let me       = this,
            itemText = record[me.displayField],
            filter;

        if (me.highlightFilterValue) {
            filter = me.store.getFilter(me.displayField);

            if (filter && filter.value !== null && filter.value !== '') {
                itemText = itemText.replace(new RegExp(filter.value, 'gi'), function(match) {
                    return '<span class="neo-highlight-search">' + match + '</span>'
                })
            }
        }

        return itemText
    }

    /**
     * @param {Boolean} silent=false
     */
    createItems(silent=false) {
        let me                        = this,
            {headerlessSelectedIndex} = me,
            vdom                      = me.getVdomRoot(),
            listItem;

        // in case we set headerlessSelectedIndex before the store was loaded, selectedIndex can be null
        // and the wanted selection is not initially there
        if (Neo.isNumber(headerlessSelectedIndex) && !Neo.isNumber(me.selectedIndex)) {
            me.afterSetHeaderlessSelectedIndex(headerlessSelectedIndex, null)
        }

        if (!(me.animate && !me.getPlugin('list-animate'))) {
            vdom.cn = [];

            me.store.items.forEach((item, index) => {
                listItem = me.createItem(item, index);
                listItem && vdom.cn.push(listItem)
            });

            !silent && me.promiseUpdate().then(() => {
                me.fire('createItems')
            })
        }
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me = this;

        me.selectionModel?.destroy();

        me.autoDestroyStore && me.store?.destroy();

        super.destroy(...args)
    }

    /**
     * Calls focus() on the top level DOM node of this component or on a given node via id
     * @param {String} [id=this.id]
     */
    focus(id=this.id) {
        this.mounted && Neo.main.addon.Navigator.navigateTo([id, this.navigator])
    }

    /**
     * Transforms an index excluding list item headers into the real store index
     * @param {Number} headerlessSelectedIndex
     * @returns {Number}
     */
    getSelectedIndex(headerlessSelectedIndex) {
        let delta   = 0,
            i       = 0,
            records = this.store.items,
            len     = headerlessSelectedIndex;

        if (records.length < 1) {
            return null
        }

        for (; i <= len; i++) {
            if (records[i].isHeader) {
                delta++;
                len++
            }
        }

        return headerlessSelectedIndex + delta
    }

    /**
     * Returns the index of a list item excluding item headers
     * @param {Number} index
     * @returns {Number}
     */
    getHeaderlessIndex(index) {
        let headerlessIndex = 0,
            i               = 0,
            records         = this.store.items;

        for (; i < index; i++) {
            if (!records[i].isHeader) {
                headerlessIndex++
            }
        }

        return headerlessIndex
    }

    /**
     * @param {Number|String|object} recordOrId
     * @returns {String}
     */
    getItemId(recordOrId) {
        return `${this.id}__${recordOrId.isRecord ? recordOrId[this.getKeyProperty()] : recordOrId}`
    }

    /**
     * @param {String} vnodeId
     * @returns {String|Number} itemId
     */
    getItemRecordId(vnodeId) {
        let itemId   = vnodeId.split('__')[1],
            {model}  = this.store,
            keyField = model?.getField(this.getKeyProperty()),
            keyType  = keyField?.type?.toLowerCase();

        if (keyType === 'int' || keyType === 'integer') {
            itemId = parseInt(itemId)
        }

        return itemId
    }

    /**
     * Support collections & stores
     * @returns {String}
     */
    getKeyProperty() {
        return this.store.keyProperty || this.store.model.keyProperty
    }

    /**
     * @param {Object} data
     */
    onClick(data) {
        let me = this,
            item;

        if (data.path[0].id === me.id) {
            me.onContainerClick(data)
        } else {
            for (item of data.path) {
                if (item.cls.includes(me.itemCls)) {
                    me.onItemClick(item, data);
                    break
                }
            }
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        this.selectionModel?.register(this)
    }

    /**
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
        this.fire('containerClick', data)
    }

    /**
     * @param {Object} node
     * @param {Object} data
     */
    onItemClick(node, data) {
        let me     = this,
            record = me.store.get(me.getItemRecordId(node.id));

        // pass the record to class extensions
        data.record = record;

        /**
         * The itemClick event fires when a click occurs on a list item
         * @event itemClick
         * @param {String} id the record matching the list item
         * @returns {Object}
         */
        me.fire('itemClick', {
            record
        })
    }

    /**
     *
     */
    onStoreFilter() {
        this.createItems()
    }

    /**
     *
     */
    onStoreLoad() {
        let me = this;

        if (!me.mounted && me.rendering) {
            me.on('mounted', () => {
                me.createItems()
            }, me, {once: true});
        } else {
            me.createItems()
        }
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.fields Each field object contains the keys: name, oldValue, value
     * @param {Number} data.index
     * @param {Neo.data.Model} data.model
     * @param {Object} data.record
     */
    onStoreRecordChange(data) {
        let me      = this,
            {index} = data;

        // ignore changes for records which have not been added to the list yet
        if (index > -1) {
            me.vdom.cn[index] = me.createItem(data.record, index);
            me.update()
        }
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.items
     * @param {Object[]} data.previousItems
     * @param {Neo.data.Store} data.scope
     */
    onStoreSort(data) {
        this.createItems()
    }

    /**
     * Convenience shortcut
     * @param {Number|String} item
     */
    selectItem(item) {
        let me = this;

        if (!me.disableSelection) {
            // Selecting index
            if (Neo.isNumber(item)) {
                me.selectionModel?.selectAt(item)
            }
            // Selecting record
            else if (item) {
                me.selectionModel?.selectAt(me.store.indexOf(item))
            }
        }
    }
}

export default Neo.setupClass(Base);
