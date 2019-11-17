import Text from './Text.mjs';

/**
 * @class Neo.form.field.Email
 * @extends Neo.form.field.Text
 */
class Email extends Text {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.Email'
         * @private
         */
        className: 'Neo.form.field.Email',
        /**
         * @member {String} ntype='emailfield'
         * @private
         */
        ntype: 'emailfield',
        /**
         * @member {String} inputType='email'
         */
        inputType: 'email'
    }}
}

Neo.applyClassConfig(Email);

export {Email as default};