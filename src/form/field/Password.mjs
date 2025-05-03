import Text from './Text.mjs';

/**
 * @class Neo.form.field.Password
 * @extends Neo.form.field.Text
 */
class Password extends Text {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Password'
         * @protected
         */
        className: 'Neo.form.field.Password',
        /**
         * @member {String} ntype='passwordfield'
         * @protected
         */
        ntype: 'passwordfield',
        /**
         * Value for the inputType_ textfield config
         * @member {String} inputType='password'
         */
        inputType: 'password'
    }
}

export default Neo.setupClass(Password);
