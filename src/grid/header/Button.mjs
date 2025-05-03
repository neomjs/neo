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
         */
        iconCls: 'fa fa-arrow-circle-up',
        /**
         * @member {String} iconPosition='right'
         */
        iconPosition: 'right',
        /**
         * 'ASC', 'DESC' or null
         * @member {String|null} isSorted_=null
         * @protected
         */
        isSorted_: null,
        /**
         * @member {String} role='columnheader'
         */
        role: 'columnheader',
        /**
         * @member {Boolean} showHeaderFilter_=false
         */
        showHeaderFilter_: false,
        /**
         * @member {Boolean} sortable_=true
         */
        sortable_: true
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
            container = me.up('grid-container');

        switch(value) {
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
     * @param {Object} data
     */
    changeFilterOperator(data) {
        let me            = this,
            gridContainer = me.up('grid-container'),
            store         = gridContainer?.store,
            operator      = data.value,
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
        let me            = this,
            gridContainer = me.up('grid-container'),
            store         = gridContainer?.store,
            {value}       = data,
            field, filter, filters, model;

        if (store) {
            filter = store.getFilter(me.dataField);
            model  = store.model;
            field  = model.getField(me.dataField);

            if (value && field?.type.toLowerCase() === 'date') {
                value = new Date(value)
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
