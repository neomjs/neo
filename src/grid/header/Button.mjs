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
         * @member {Array} cls=['neo-grid-header-button']
         */
        cls: ['neo-grid-header-button'],
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
        let me        = this,
            cls       = me.cls,
            container = me.up('grid-container');

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

        me.mounted && me.fire('sort', {
            direction: value,
            property : me.dataField
        });
    }
}

Neo.applyClassConfig(Button);

export default Button;
