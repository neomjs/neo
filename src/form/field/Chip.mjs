import ComboBox from './ComboBox.mjs';

/**
 * @class Neo.form.field.Chip
 * @extends Neo.form.field.ComboBox
 */
class Chip extends ComboBox {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Chip'
         * @protected
         */
        className: 'Neo.form.field.Chip',
        /**
         * @member {String} ntype='chipfield'
         * @protected
         */
        ntype: 'chipfield',
        /**
         * @member {Object|null} listConfig={useCheckBoxes: true}
         */
        listConfig: {
            useCheckBoxes: true
        }
    }
}

export default Neo.setupClass(Chip);
