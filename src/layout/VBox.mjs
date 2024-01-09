import Flexbox from './Flexbox.mjs';

/**
 * @class Neo.layout.VBox
 * @extends Neo.layout.Flexbox
 */
class VBox extends Flexbox {
    static config = {
        /**
         * @member {String} className='Neo.layout.VBox'
         * @protected
         */
        className: 'Neo.layout.VBox',
        /**
         * @member {String} ntype='layout-vbox'
         * @protected
         */
        ntype: 'layout-vbox',
        /**
         * @member {String} direction='column'
         * @protected
         */
        direction: 'column'
    }

    /**
     * Applies the flex value to an item of the container this layout is bound to
     * @param {Neo.component.Base} item
     */
    applyChildAttributes(item) {
        // Do not apply flex if fixed height
        !item.height && super.applyChildAttributes(item)
    }
}

Neo.applyClassConfig(VBox);

export default VBox;
