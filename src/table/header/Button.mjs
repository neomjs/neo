import {default as BaseButton} from '../../component/Button.mjs';
import NeoArray                from '../../util/Array.mjs';
import {default as TextField}  from '../../form/field/Text.mjs';

/**
 * @class Neo.table.header.Button
 * @extends Neo.component.Button
 */
class Button extends BaseButton {
    static getStaticConfig() {return {
        /**
         * Valid values for align
         * @member {String[]} alignValues: ['left', 'center', 'right']
         * @protected
         * @static
         */
        alignValues: ['left', 'center', 'right']
    }}

    static getConfig() {return {
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
         * Alignment of the matching table cells. Valid values are left, center, right
         * @member {String} align_='left'
         */
        align_: 'left',
        /**
         * @member {Array} cls=['neo-table-header-button']
         */
        cls: ['neo-table-header-button'],
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
         */
        draggable_: true,
        /**
         * @member {Object} editorFieldConfig=null
         * @protected
         */
        editorFieldConfig: null,
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
         * Scope to execute the column renderer.
         * Defaults to the matching table.Container
         * @member {Neo.core.Base|null} rendererScope=null
         */
        rendererScope: null,
        /**
         * @member {Boolean} showHeaderFilter_=false
         */
        showHeaderFilter_: false,
        /**
         * @member {String} _vdom
         */
        _vdom: {
            tag: 'th',
            cn : [{
                tag: 'button',
                cn : [{
                    tag: 'span',
                    cls: ['neo-button-glyph']
                },{
                    tag: 'span',
                    cls: ['neo-button-text']
                }]
            }]
        }
    }}

    /**
     * Specify a different vdom root if needed to apply the top level style attributes on a different level.
     * Make sure to use getVnodeRoot() as well, to keep the vdom & vnode trees in sync.
     * @returns {Object} The new vdom root
     */
    getVdomRoot() {
        return this.vdom.cn[0];
    }

    /**
     * Specify a different vnode root if needed to apply the top level style attributes on a different level.
     * Make sure to use getVdomRoot() as well, to keep the vdom & vnode trees in sync.
     * @returns {Object} The new vnode root
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0];
    }

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me        = this,
            listeners = {
                click: me.onButtonClick,
                scope: me
            };

        if (me.draggable) {
            Object.assign(listeners, {
                dragend  : me.onDragEnd,
                dragenter: me.onDragEnter,
                dragleave: me.onDragLeave,
                dragover : me.onDragOver,
                dragstart: me.onDragStart,
                drop     : me.onDrop,
            });
        }

        me.domListeners = listeners;
    }

    /**
     * Triggered after the draggable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDraggable(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        if (value === true) {
            me.getVdomRoot().draggable = true;
        } else {
            delete me.getVdomRoot().draggable;
        }

        me.vdom = vdom;
    }

    /**
     * Triggered after the isSorted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsSorted(value, oldValue) {
        let me        = this,
            cls       = me.cls,
            container = me.up('table-container');

        switch(value) {
            case null:
                NeoArray.add(cls, 'neo-sort-hidden');
                break;
            case 'ASC':
                NeoArray.remove(cls, 'neo-sort-desc');
                NeoArray.remove(cls, 'neo-sort-hidden');
                NeoArray.add(cls, 'neo-sort-asc');
                break;
            case 'DESC':
                NeoArray.remove(cls, 'neo-sort-asc');
                NeoArray.remove(cls, 'neo-sort-hidden');
                NeoArray.add(cls, 'neo-sort-desc');
                break;
        }

        me.cls = cls;

        // testing check until all example tables have a store
        if (!container || !container.store) {
            return;
        }

        if (me.mounted) {
            me.fire('sort', {
                direction: value,
                property : me.dataField
            });
        }
    }

    /**
     * Triggered after the showHeaderFilter config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowHeaderFilter(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        if (value) {
            if (!me.filterField) {
                me.filterField = Neo.create({
                    module   : TextField,
                    flag     : 'filter-field',
                    hideLabel: true,

                    listeners: {
                        change: me.changeFilter,
                        scope : me
                    },

                    style: {
                        marginLeft : '.5em',
                        marginRight: '.5em'
                    },
                    ...me.editorFieldConfig || {}
                });

                me.vdom.cn.push(me.filterField.vdom);
            } else {
                delete me.filterField.vdom.removeDom;
            }
        } else if (me.filterField) {
            me.filterField.vdom.removeDom = true;
        }

        me.vdom = vdom;
    }

    /**
     * Triggered before the align config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetAlign(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'align', 'alignValues');
    }

    /**
     *
     */
    destroy(...args) {
        if (this.filterField) {
            this.filterField.destroy();
        }

        super.destroy(...args);
    }

    /**
     * @protected
     */
    onButtonClick() {
        let me = this,
            map;

        if (me.defaultSortDirection === 'DESC') {
            map = {
                ASC : null,
                DESC: 'ASC',
                null: 'DESC'
            };
        } else {
            map = {
                ASC : 'DESC',
                DESC: null,
                null: 'ASC'
            };
        }

        me.isSorted = map[me.isSorted + ''];
    }

    /**
     * @protected
     */
    onDragEnd() {
        let me    = this,
            style = me.style;

        delete style.opacity;
        me.style = style;
    }

    /**
     * @protected
     */
    onDragEnter() {
        let me  = this,
            cls = me.cls;

        NeoArray.add(cls, 'neo-drag-over');
        me.cls = cls;
    }

    /**
     * @protected
     */
    onDragLeave() {
        let me  = this,
            cls = me.cls;

        NeoArray.remove(cls, 'neo-drag-over');
        me.cls = cls;
    }

    /**
     *
     * @param {Object} event
     */
    onDragOver(event) {
        //console.log('onDragOver', event);
    }

    /**
     * @protected
     */
    onDragStart() {
        let me    = this,
            style = me.style;

        style.opacity = 0.4;
        me.style = style;
    }

    /**
     *
     * @param {Object} data
     */
    onDrop(data) {
        let me             = this,
            headerToolbar  = Neo.getComponent(me.parentId),
            tableContainer = Neo.getComponent(headerToolbar.parentId);

        delete Neo.getComponent(data.srcId).getVdomRoot().style.opacity;

        me.onDragLeave();
        headerToolbar.switchItems(me.id, data.srcId);
        tableContainer.createViewData(tableContainer.store.data);
    }

    /**
     *
     * @param {Object} data
     */
    changeFilter(data) {
        let me             = this,
            tableContainer = me.up('table-container'),
            store          = tableContainer && tableContainer.store,
            filter, filters;

        if (store) {
            filter = store.getFilter(me.dataField);

            if (!filter) {
                filters = store.filters;

                filters.push({
                    property: me.dataField,
                    operator: 'like',
                    value   : data.value
                });

                store.filters = filters;
            } else {
                filter.value = data.value;
            }
        }
    }

    /**
     * @protected
     */
    removeSortingCss() {
        let me  = this,
            cls = me.cls;

        NeoArray.add(cls, 'neo-sort-hidden');

        me.cls      = cls;
        me._isSorted = null;
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.dataField
     * @param {Number} data.index
     * @param {Object} data.record
     * @param {Number|String} data.value
     * @returns {*}
     */
    renderer(data) {
        return data.value;
    }
}

Neo.applyClassConfig(Button);

export {Button as default};