import BaseButton from '../../button/Base.mjs';
import NeoArray   from '../../util/Array.mjs';

/**
 * @class Neo.grid.header.Button
 * @extends Neo.button.Base
 */
class Button extends BaseButton {
    /**
     * Valid values for align
     * @member {String[]} cellAlignValues: ['left', 'center', 'right']
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
         * @member {String[]} baseCls=['neo-grid-header-button']
         */
        baseCls: ['neo-grid-header-button'],
        /**
         * Alignment of the matching table cells. Valid values are left, center, right
         * @member {String} cellAlign_='left'
         */
        cellAlign_: 'left',
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
        isSorted_: null
    }

    /**
     * Sort direction when clicking on an unsorted button
     * @member {String} defaultSortDirection='ASC'
     */
    defaultSortDirection = 'ASC'
    /**
     * @member {String|null} field=null
     */
    field = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            click: me.onButtonClick,
            scope: me
        })
    }

    /**
     * Triggered after the isSorted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsSorted(value, oldValue) {
        let me    = this,
            {cls} = me;

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

        me.mounted && me.fire('sort', {
            direction: value,
            property : me.field
        })
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
            }
        } else {
            map = {
                ASC : 'DESC',
                DESC: null,
                null: 'ASC'
            }
        }

        me.isSorted = map[me.isSorted + '']
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
     * @param {Object} data
     * @param {String} data.field
     * @param {Number} data.index
     * @param {Object} data.record
     * @param {Number|String} data.value
     * @returns {*}
     */
    renderer(data) {
        return data.value
    }
}

Neo.setupClass(Button);

export default Button;
