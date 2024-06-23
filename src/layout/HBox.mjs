import Flexbox from './Flexbox.mjs';

/**
 * @class Neo.layout.HBox
 * @extends Neo.layout.Flexbox
 */
class HBox extends Flexbox {
    static config = {
        /**
         * @member {String} className='Neo.layout.HBox'
         * @protected
         */
        className: 'Neo.layout.HBox',
        /**
         * @member {String} ntype='layout-hbox'
         * @protected
         */
        ntype: 'layout-hbox',
        /**
         * @member {String} direction='row'
         * @protected
         */
        direction: 'row'
    }

    /**
     * Applies the flex value to an item of the container this layout is bound to
     * @param {Neo.component.Base} item
     * @param {Number} index
     */
    applyChildAttributes(item, index) {
        // Do not apply flex if fixed width
        !item.width && super.applyChildAttributes(item, index)
    }
}

Neo.setupClass(HBox);

export default HBox;
