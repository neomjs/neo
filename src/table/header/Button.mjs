import BaseButton        from '../../button/Base.mjs';
import NeoArray          from '../../util/Array.mjs';
import TextField         from '../../form/field/Text.mjs';
import {resolveCallback} from '../../util/Function.mjs';

/**
 * @class Neo.table.header.Button
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
         * @member {String} className='Neo.table.header.Button'
         * @protected
         */
        className: 'Neo.table.header.Button',
        /**
         * @member {String} ntype='table-header-button'
         * @protected
         */
        ntype: 'table-header-button',
        /**
         * @member {String[]} baseCls=['neo-table-header-button']
         */
        baseCls: ['neo-table-header-button'],
        /**
         * Alignment of the matching table cells. Valid values are left, center, right
         * @member {String} cellAlign_='left'
         * @reactive
         */
        cellAlign_: 'left',
        /**
         * The Store field addressed by this header's sort and inline filter projection.
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
         * @member {Boolean} draggable_=true
         * @reactive
         */
        draggable_: true,
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
         * @member {Function|String|null} renderer_='cellRenderer'
         * @reactive
         */
        renderer_: 'cellRenderer',
        /**
         * Scope to execute the column renderer.
         *
         * An instance set here wins. A `renderer` string resolves against an instance and records it here:
         * `'up.name'` the ancestor that defines the method, a plain name the view controller that defines it or
         * else the column. A `renderer` function names no instance and runs on the matching table.Container.
         * @member {Neo.core.Base|null} rendererScope=null
         */
        rendererScope: null,
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
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'th', cn: [
            {tag: 'button', cn: [
                {tag: 'span', cls: ['neo-button-glyph']},
                {tag: 'span', cls: ['neo-button-text']},
                {tag: 'span', cls: ['neo-button-badge']},
                {tag: 'span', cls: ['neo-button-ripple-wrapper'], cn: [
                    {tag: 'span', cls: ['neo-button-ripple']}
                ]}
            ]}
        ]}
    }

    /** @member {Promise|null} headerFilterReady=null @protected */
    headerFilterReady = null

    /**
     * Triggered after the isSorted config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetIsSorted(value, oldValue) {
        let me        = this,
            container = me.up('table-container'),
            // WAI-ARIA 1.2 allows aria-sort on a columnheader only. In a table that is the <th> this button sits
            // in, not the button itself, so the attribute cannot ride on changeVdomRootKey(): that one addresses
            // getVdomRoot(), which this class points at the native button for the top level style attributes.
            // The class change below rides in the same vdom update, so the write needs no update() of its own.
            header    = me.vdom;

        if (value) header['aria-sort'] = value === 'ASC' ? 'ascending' : 'descending';
        else delete header['aria-sort'];

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

        // testing check until all example tables have a store
        if (!container || !container.store) {
            return
        }

        me.mounted && me.fire('sort', {
            direction: value,
            property : me.dataField
        })
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
     * @summary Attaches the shared inline projection once without introducing a Table menu surface.
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
     * Triggered before the renderer config gets changed
     * @param {Function|String|null} value
     * @param {Function|String|null} oldValue
     * @protected
     */
    beforeSetRenderer(value, oldValue) {
        let me          = this,
            {fn, scope} = resolveCallback(value, me);

        // A name resolves against the instance its method must run on, a function against none.
        // An explicit rendererScope stays the author's.
        if (Neo.isString(value) && fn && !me.rendererScope) {
            me.rendererScope = scope
        }

        return fn
    }

    /**
     * @param {Object}              data
     * @param {Neo.button.Base}     data.column
     * @param {Number}              data.columnIndex
     * @param {String}              data.dataField
     * @param {Object}              data.record
     * @param {Number}              data.rowIndex
     * @param {Neo.table.Container} data.tableContainer
     * @param {Number|String}       data.value
     * @returns {*}
     */
    cellRenderer(data) {
        return data.value
    }

    /**
     * @summary Updates the shared inline contribution without replacing picker or application predicates.
     * @param {Object} data
     */
    changeFilterOperator(data) {
        let me             = this,
            tableContainer = me.up('table-container'),
            store          = tableContainer?.store,
            operator       = data.value,
            filter;

        if (store) {
            filter = store.getFilter(me.dataField, 'header-inline');

            if (!filter) {
                store.filters = [...store.filters, {
                    ...me.filterConfig,
                    property : me.dataField,
                    value    : null,
                    operator,
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
        let me             = this,
            tableContainer = me.up('table-container'),
            store          = tableContainer?.store,
            {value}        = data,
            field, filter, model;

        if (store) {
            filter = store.getFilter(me.dataField, 'header-inline');
            model  = store.model;
            field  = model && model.getField(me.dataField);

            if (value && field?.type?.toLowerCase() === 'date') {
                value = new Date(value)
            }

            if (Neo.isRecord(value)) {
                value = value[me.filterField.displayField]
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
     *
     */
    destroy(...args) {
        this.filterField?.destroy();

        super.destroy(...args)
    }

    /**
     * Specify a different vdom root if needed to apply the top level style attributes on a different level.
     * Make sure to use getVnodeRoot() as well, to keep the vdom & vnode trees in sync.
     * @returns {Object} The new vdom root
     */
    getVdomRoot() {
        return this.vdom.cn[0]
    }

    /**
     * Specify a different vnode root if needed to apply the top level style attributes on a different level.
     * Make sure to use getVdomRoot() as well, to keep the vdom & vnode trees in sync.
     * @returns {Object} The new vnode root
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0]
    }

    /**
     * @summary Sorts header gestures without treating inline filter controls as sort actions.
     * @param {Object} data
     * @protected
     */
    onClick(data) {
        const {filterField} = this;
        if (filterField && data.path.some(node => node.id === filterField.id)) {
            return
        }

        let me = this,
            map;

        if (me.defaultSortDirection === 'DESC') {
            map = {
                ASC : null,
                DESC: 'ASC',
                null: 'DESC'
            }
        } else {
            map = {
                ASC : 'DESC',
                DESC: null,
                null: 'ASC'
            }
        }

        // A non-sortable header keeps its click (the button handler), but never starts a sort
        if (me.sortable) {
            me.isSorted = map[me.isSorted + '']
        }

        super.onClick(data)
    }

    /**
     * @protected
     */
    removeSortingCss() {
        let me    = this,
            {cls} = me;

        // This path resets _isSorted directly, so it bypasses afterSetIsSorted() and owns the aria-sort clear.
        // It cannot lean on the class change below either: a header that was already hidden writes the same
        // cls array back and produces no update, which would leave the stale attribute in the DOM.
        delete me.vdom['aria-sort'];
        me.update();

        NeoArray.add(cls, 'neo-sort-hidden');

        me.cls       = cls;
        me._isSorted = null
    }
}

export default Neo.setupClass(Button);
