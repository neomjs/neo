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
         * data passes inputPattern, maxLength, minLength & valueLength properties
         * @member {Function} errorTextInputPattern=data=>`Not a valid phone number``
         */
        errorTextInputPattern: data => `Not a valid phone number`,
        /**
         * @member {RegExp|null} inputPattern=/^\+?\(?[0-9]+\)?([\-\s\.]?[/0-9]+)*$/
         */
        inputPattern: /^\+?\(?[0-9]+\)?([\-\s\.]?[/0-9]+)*$/,
        /**
         * @member {Boolean} inputPatternDOM=false
         */
        inputPatternDOM: false,
        /**
         * Value for the inputType_ textfield config
         * @member {String} inputType='tel'
         */
        inputType: 'tel'
    }
}

Neo.setupClass(Phone);

export default Phone;
