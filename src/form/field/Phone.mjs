import Text from './Text.mjs';

/**
 * An extended form.field.Text which uses an input type 'tel'
 * @class Neo.form.field.Phone
 * @extends Neo.form.field.Text
 */
class Phone extends Text {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Phone'
         * @protected
         */
        className: 'Neo.form.field.Phone',
        /**
         * @member {String} ntype='phonefield'
         * @protected
         */
        ntype: 'phonefield',
        /**
         * Value for the inputType_ textfield config
         * @member {String} inputType='tel'
         */
        inputType: 'tel'
    }
}

Neo.applyClassConfig(Phone);

export default Phone;
