import Text from './Text.mjs';

/**
 * @class Neo.form.field.Password
 * @extends Neo.form.field.Text
 */
class Password extends Text {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.Password'
         * @private
         */
        className: 'Neo.form.field.Password',
        /**
         * @member {String} ntype='passwordfield'
         * @private
         */
        ntype: 'passwordfield',
        /**
         * Value for the inputType_ textfield config
         * @member {String} inputType='password'
         */
        inputType: 'password'
    }}
}

Neo.applyClassConfig(Password);

export {Password as default};