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
         * @member {String|null} dataField=null
         */
        dataField: null,
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
         * Defaults to the matching table.Container
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

    /**
     * Triggered after the isSorted config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetIsSorted(value, oldValue) {
        let me        = this,
            {cls}     = me,
            container = me.up('table-container');

        switch (value) {
            case null:
                NeoArray.add(cls, 'neo-sort-hidden');
                break
            case 'ASC':
                NeoArray.remove(cls, 'neo-sort-desc');
                NeoArray.remove(cls, 'neo-sort-hidden');
                NeoArray.add(cls, 'neo-sort-asc');
                break
            case 'DESC':
                NeoArray.remove(cls, 'neo-sort-asc');
                NeoArray.remove(cls, 'neo-sort-hidden');
                NeoArray.add(cls, 'neo-sort-desc');
                break
        }

        me.cls = cls;

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
        } else if (me.filterField) {
            me.filterField.vdom.removeDom = true
        }

        me.updateDepth = 2;
        me.update()
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
        return resolveCallback(value, this).fn
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
     * @param {Object} data
     */
    changeFilterOperator(data) {
        let me             = this,
            tableContainer = me.up('table-container'),
            store          = tableContainer?.store,
            operator       = data.value,
            filter, filters;

        if (store) {
            filter = store.getFilter(me.dataField);

            if (!filter) {
                filters = store.filters;

                filters.push({
                    property: me.dataField,
                    operator,
                    value   : null,
                    ...me.filterConfig
                });

                store.filters = filters
            } else {
                filter.operator = operator
            }
        }
    }

    /**
     * @param {Object} data
     */
    changeFilterValue(data) {
        let me             = this,
            tableContainer = me.up('table-container'),
            store          = tableContainer?.store,
            {value}        = data,
            field, filter, filters, model;

        if (store) {
            filter = store.getFilter(me.dataField);
            model  = store.model;
            field  = model && model.getField(me.dataField);

            if (value && field.type.toLowerCase() === 'date') {
                value = new Date(value)
            }

            if (Neo.isRecord(value)) {
                value = value[me.filterField.displayField]
            }

            if (!filter) {
                filters = store.filters;

                filters.push({
                    property: me.dataField,
                    operator: 'like',
                    value,
                    ...me.filterConfig
                });

                store.filters = filters
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
     * @param {Object} data
     * @protected
     */
    onClick(data) {
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

        me.isSorted = map[me.isSorted + ''];

        super.onClick(data)
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
}

export default Neo.setupClass(Button);
