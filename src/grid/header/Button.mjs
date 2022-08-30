import BaseButton from '../../button/Base.mjs';
import NeoArray   from '../../util/Array.mjs';

/**
 * @class Neo.grid.header.Button
 * @extends Neo.button.Base
 */
class Button extends BaseButton {
    static getConfig() {return {
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
         * @member {String[]} cls=['neo-grid-header-button']
         */
        cls: ['neo-grid-header-button'],
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
    }}

    /**
     * Triggered after the isSorted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsSorted(value, oldValue) {
        let me  = this,
            cls = me.cls;

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
            property : me.dataField
        });
    }

    /**
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

export default Button;
