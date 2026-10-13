import BaseButton from '../../button/Base.mjs';
import NeoArray   from '../../util/Array.mjs';
import TextField  from '../../form/field/Text.mjs';

/**
 * @class Neo.grid.header.Button
 * @extends Neo.button.Base
 */
class Button extends BaseButton {
    /**
     * Valid values for align
     * @member {String[]} cellAlignValues: ['left','center','right']
     * @protected
     * @static
     */
    static cellAlignValues = ['left', 'center', 'right']

    static config = {
        /**
         * @member {String} className='Neo.grid.header.Button'
         * @protected
         */
        className: 'Neo.grid.header.Button',
        /**
         * @member {String} ntype='grid-header-button'
         * @protected
         */
        ntype: 'grid-header-button',
        /**
         * @member {String[]} baseCls=['neo-grid-header-button','neo-button']
         */
        baseCls: ['neo-grid-header-button', 'neo-button'],
        /**
         * Alignment of the matching grid cells. Valid values are left, center, right
         * @member {String} cellAlign_='left'
         * @reactive
         */
        cellAlign_: 'left',
        /**
         * Enables the optional value-filter surface on this header.
         * @member {Boolean} columnMenu_=false
         * @reactive
         */
        columnMenu_: false,
        /**
         * The Store field addressed by this header's sort and filter projections.
         * @member {String|null} dataField_=null
         * @reactive
         */
        dataField_: null,
        /**
         * Sort direction when clicking on an unsorted button
         * @member {String} defaultSortDirection='ASC'
         */
        defaultSortDirection: 'ASC',
        /**
         * @member {Object} editorConfig=null
         */
        editorConfig: null,
        /**
         * @member {Object} filterConfig=null
         */
        filterConfig: null,
        /**
         * @member {Neo.form.field.Base|null} filterField=null
         * @protected
         */
        filterField: null,
        /**
         * @member {Number|String|null} flex='none'
         */
        flex: 'none',
        /**
         * @member {String} iconCls='fa fa-arrow-circle-up'
         * @reactive
         */
        iconCls: 'fa fa-arrow-circle-up',
        /**
         * @member {String} iconPosition='right'
         * @reactive
         */
        iconPosition: 'right',
        /**
         * 'ASC', 'DESC' or null
         * @member {String|null} isSorted_=null
         * @protected
         * @reactive
         */
        isSorted_: null,
        /**
         * Use 'start' to pin the column to the start of the row.
         * Use 'end' to pin the column to the end of the row.
         * Use null for standard, scrollable columns.
         * @member {String|null} locked_=null
         * @reactive
         */
        locked_: null,
        /**
         * @member {Boolean} resizable_=true
         * @reactive
         */
        resizable_: true,
        /**
         * @member {String} role='columnheader'
         * @reactive
         */
        role: 'columnheader',
        /**
         * @member {Boolean} showHeaderFilter_=false
         * @reactive
         */
        showHeaderFilter_: false,
        /**
         * @member {Boolean} sortable_=true
         * @reactive
         */
        sortable_: true,
        /**
         * True enables restoring the initial sort state (ASC, DESC, null)
         * @member {Boolean} useTriStateSorting_=false
         * @reactive
         */
        useTriStateSorting_: false
    }

    /** @member {Promise|null} headerFilterReady=null @protected */
    headerFilterReady = null
    /** @member {Number} columnMenuSerial=0 @protected */
    columnMenuSerial = 0
    /** @member {Boolean} menuRootWrapped=false @protected */
    menuRootWrapped = false

    /**
     * Triggered after the isSorted config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetIsSorted(value, oldValue) {
        let me        = this,
            container = me.up('grid-container');

        switch (value) {
            case null:
                me.addCls('neo-sort-hidden');
                break
            case 'ASC':
                me.removeAddCls(['neo-sort-desc', 'neo-sort-hidden'], 'neo-sort-asc');
                break
            case 'DESC':
                me.removeAddCls(['neo-sort-asc', 'neo-sort-hidden'], 'neo-sort-desc');
                break
        }

        // testing check until all example grids have a store
        if (!container || !container.store) {
            return
        }

        me.mounted && me.fire('sort', {
            direction: value,
            property : me.dataField
        })
    }

    /**
     * Triggered after the locked config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetLocked(value, oldValue) {
        let {cls} = this;

        NeoArray.remove(cls, 'neo-locked-start');
        NeoArray.remove(cls, 'neo-locked-end');

        if (value === 'start') {
            NeoArray.add(cls, 'neo-locked-start')
        } else if (value === 'end') {
            NeoArray.add(cls, 'neo-locked-end')
        }

        this.cls = cls
    }

    /**
     * Triggered after the resizable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetResizable(value, oldValue) {
        if (value && !this.getPlugin('plugin-grid-header-resizable')) {
            import('./plugin/Resizable.mjs').then(module => {
                let me        = this,
                    {appName} = me,
                    plugins   = me.plugins || [];

                plugins.push({
                    module : module.default,
                    appName
                });

                me.plugins = plugins
            })
        }
    }

    /**
     * Triggered after the showHeaderFilter config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowHeaderFilter(value, oldValue) {
        let me = this;

        if (value) {
            if (!me.filterField) {
                me.filterField = Neo.create({
                    module   : TextField,
                    appName  : me.appName,
                    flag     : 'filter-field',
                    hideLabel: true,
                    parentId : me.id,
                    style    : {marginLeft: '.5em', marginRight: '.5em'},
                    windowId : me.windowId,

                    listeners: {
                        change        : me.changeFilterValue,
                        operatorChange: me.changeFilterOperator,
                        scope         : me
                    },

                    ...me.editorConfig
                });

                me.vdom.cn.push(me.filterField.createVdomReference())
            } else {
                delete me.filterField.vdom.removeDom
            }
            me.ensureHeaderFilterProjection()
        } else if (me.filterField) {
            me.filterField.vdom.removeDom = true
        }

        me.updateDepth = 2;
        me.update()
    }

    /**
     * @summary Attaches the shared inline projection once; late imports cannot attach to a retired header.
     * @returns {Promise}
     */
    ensureHeaderFilterProjection() {
        return this.headerFilterReady ||= import('../../plugin/HeaderFilter.mjs').then(({default: module}) => {
            if (!this.isDestroyed && !this.isDestroying) {
                let plugin = this.getPlugin('plugin-header-filter');
                if (!plugin) {
                    this.plugins = [...(this.plugins || []), {module}];
                    plugin = this.getPlugin('plugin-header-filter')
                }
                plugin.syncField()
            }
        })
    }

    /**
     * @summary Lazily enables the menu while keeping its default free of trigger and handler registration.
     * @param {Boolean} value
     */
    afterSetColumnMenu(value) {
        const serial = this.columnMenuSerial = (this.columnMenuSerial || 0) + 1;
        if (!value) {
            this.getPlugin('plugin-grid-header-menu')?.destroy();
            return
        }
        import('./plugin/Menu.mjs').then(({default: module}) => {
            if (!this.isDestroyed && !this.isDestroying && this.columnMenu && this.columnMenuSerial === serial &&
                !this.getPlugin('plugin-grid-header-menu')) {
                this.plugins = [...(this.plugins || []), {module}]
            }
        })
    }

    /**
     * @summary Creates a stable sibling-trigger wrapper while retaining the native sort button and its focus identity.
     */
    prepareColumnMenuWrapper() {
        if (this.menuRootWrapped) return;
        const root = this.vdom;
        this.menuRootWrapped = true;
        this._vdom = {tag: 'div', cls: ['neo-grid-menu-wrapper'], cn: [root]};
        this.ensureStableIds();
        const parent = this.parent, reference = parent?.getVdomItemsRoot().cn.find(node => node.componentId === this.id);
        if (reference) Object.assign(reference, this.createVdomReference());
        this.wrapperCls = [...(this.wrapperCls || []), 'neo-grid-menu-wrapper'];
        this.afterSetWidth(this.width);
        this.updateDepth = -1;
        if (reference) {
            parent.updateDepth = -1;
            parent.update()
        } else {
            this.update()
        }
    }

    /**
     * @summary Sizes the whole composed header; its sort button continues to span that complete column.
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     */
    afterSetWidth(value, oldValue) {
        super.afterSetWidth(value, oldValue);
        if (this.menuRootWrapped) {
            delete this.getVdomRoot().width;
            this.wrapperStyle = {width: typeof value === 'number' ? `${value}px` : value}
        }
    }

    /** @summary Returns the native sort-button vdom. @returns {Object} */
    getVdomRoot() {
        return this.menuRootWrapped ? this.vdom.cn[0] : super.getVdomRoot()
    }

    /** @summary Returns the native sort vnode, including the pending wrapper transition. @returns {Object} */
    getVnodeRoot() {
        return this.vnode?.id === `${this.id}__wrapper` ? this.vnode.childNodes[0] : super.getVnodeRoot()
    }

    /**
     * @summary Lets the parent own a root-shape transition; a child diff requires unchanged root identity.
     * @param {Function} [resolve]
     * @param {Function} [reject]
     */
    updateVdom(resolve, reject) {
        if (this.menuRootWrapped && this.vnode && this.vnode.id !== this.vdom.id && this.parent?.vnode) {
            this.parent.updateDepth = -1;
            this.parent.promiseUpdate().then(resolve, reject);
            return
        }
        super.updateVdom(resolve, reject)
    }

    /**
     * Triggered after the sortable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSortable(value, oldValue) {
        let me    = this,
            {cls} = me;

        NeoArray.toggle(cls, 'neo-sort-hidden', !value);

        me.cls = cls;
        me.update()
    }

    /**
     * Triggered before the cellAlign config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetCellAlign(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'cellAlign', 'cellAlignValues')
    }

    /**
     *
     */
    destroy(...args) {
        this.filterField?.destroy();
        super.destroy(...args)
    }

    /**
     * @param {Object} data
     * @protected
     */
    onClick(data) {
        if (data.path.some(node => node.cls?.includes('neo-grid-menu-trigger')) ||
            data.path[0].cls.includes('neo-resizable')) {
            return
        }

        let me = this,
            map;

        if (me.defaultSortDirection === 'DESC') {
            map = {
                ASC : me.useTriStateSorting ? null : 'DESC',
                DESC: 'ASC',
                null: 'DESC'
            }
        } else {
            map = {
                ASC : 'DESC',
                DESC: me.useTriStateSorting ? null : 'ASC',
                null: 'ASC'
            }
        }

        me.isSorted = map[me.isSorted + ''];

        super.onClick(data)
    }

    /**
     * @summary Updates this Store/field's shared inline contribution without touching picker or application filters.
     * @param {Object} data
     */
    changeFilterOperator(data) {
        let me            = this,
            gridContainer = me.up('grid-container'),
            store         = gridContainer?.store,
            operator      = data.value,
            filter;

        if (store) {
            filter = store.getFilter(me.dataField, 'header-inline');

            if (!filter) {
                store.filters = [...store.filters, {
                    ...me.filterConfig,
                    property : me.dataField,
                    operator,
                    value    : null,
                    ownerRole: 'header-inline'
                }]
            } else {
                filter.operator = operator
            }
        }
    }

    /**
     * @summary Writes input into the shared inline contribution; filterConfig supplies creation defaults only.
     * @param {Object} data
     */
    changeFilterValue(data) {
        let me            = this,
            gridContainer = me.up('grid-container'),
            store         = gridContainer?.store,
            {value}       = data,
            field, filter, model;

        if (store) {
            filter = store.getFilter(me.dataField, 'header-inline');
            model  = store.model;
            field  = model.getField(me.dataField);

            if (value && field?.type?.toLowerCase() === 'date') {
                value = new Date(value)
            }

            if (!filter) {
                store.filters = [...store.filters, {
                    operator: 'like',
                    ...me.filterConfig,
                    property : me.dataField,
                    value,
                    ownerRole: 'header-inline'
                }]
            } else {
                filter.value = value
            }
        }
    }

    /**
     * @protected
     */
    removeSortingCss() {
        let me    = this,
            {cls} = me;

        NeoArray.add(cls, 'neo-sort-hidden');

        me.cls       = cls;
        me._isSorted = null
    }

    /**
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            cellAlign           : me.cellAlign,
            columnMenu          : me.columnMenu,
            dataField           : me.dataField,
            defaultSortDirection: me.defaultSortDirection,
            editorConfig        : me.serializeConfig(me.editorConfig),
            filterConfig        : me.serializeConfig(me.filterConfig),
            isSorted            : me.isSorted,
            resizable           : me.resizable,
            showHeaderFilter    : me.showHeaderFilter,
            sortable            : me.sortable,
            useTriStateSorting  : me.useTriStateSorting
        }
    }
}

export default Neo.setupClass(Button);
