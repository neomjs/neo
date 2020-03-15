import {default as BaseButton} from '../../component/Button.mjs';
import NeoArray                from '../../util/Array.mjs';

/**
 * @class Neo.table.header.Button
 * @extends Neo.component.Button
 */
class Button extends BaseButton {
    static getStaticConfig() {return {
        /**
         * Valid values for align
         * @member {String[]} alignValues: ['left', 'center', 'right']
         * @private
         * @static
         */
        alignValues: ['left', 'center', 'right']
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.table.header.Button'
         * @private
         */
        className: 'Neo.table.header.Button',
        /**
         * @member {String} ntype='table-header-button'
         * @private
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
         * @member {Boolean} draggable_=true
         */
        draggable_: true,
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
         * @member {String|null} isSorted=null
         * @private
         */
        isSorted: null,
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
     * @private
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
     * Triggered before the align config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    beforeSetAlign(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'align', 'alignValues');
    }

    /**
     * @private
     */
    onButtonClick() {
        let me  = this,
            cls = me.cls,
            direction;

        // testing check until all example tables have a store
        if (!me.up('table-container').store) {
            return;
        }

        switch(me.isSorted) {
            case null:
                direction = 'ASC';
                NeoArray.remove(cls, 'neo-sort-desc');
                NeoArray.remove(cls, 'neo-sort-hidden');
                NeoArray.add(cls, 'neo-sort-asc');
                break;
            case 'ASC':
                direction = 'DESC';
                NeoArray.remove(cls, 'neo-sort-asc');
                NeoArray.remove(cls, 'neo-sort-hidden');
                NeoArray.add(cls, 'neo-sort-desc');
                break;
            case 'DESC':
                direction = null;
                NeoArray.add(cls, 'neo-sort-hidden');
                break;
        }

        me.cls      = cls;
        me.isSorted = direction;

        me.fire('sort', {
            direction: direction,
            property : me.dataField
        });
    }

    /**
     * @private
     */
    onDragEnd() {
        let me    = this,
            style = me.style;

        delete style.opacity;
        me.style = style;
    }

    /**
     * @private
     */
    onDragEnter() {
        let me  = this,
            cls = me.cls;

        NeoArray.add(cls, 'neo-drag-over');
        me.cls = cls;
    }

    /**
     * @private
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
     * @private
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

        Neo.getComponent(data.srcId).onDragEnd();
        me.onDragLeave();
        headerToolbar.switchItems(me.id, data.srcId);
        tableContainer.createViewData(tableContainer.store.data);
    }

    /**
     * @private
     */
    removeSortingCss() {
        let me  = this,
            cls = me.cls;

        NeoArray.add(cls, 'neo-sort-hidden');

        me.cls      = cls;
        me.isSorted = null;
    }

    /**
     *
     * @param {String} value
     * @returns {*}
     */
    renderer(value) {
        return value;
    }
}

Neo.applyClassConfig(Button);

export {Button as default};