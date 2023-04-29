import Text from './Text.mjs';

/**
 * @class Neo.form.field.Email
 * @extends Neo.form.field.Text
 */
class Email extends Text {
    /**
     * @member {RegExp} emailRegex
     * @protected
     * @static
     */
    static emailRegex = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/i

    static config = {
        /**
         * @member {String} className='Neo.form.field.Email'
         * @protected
         */
        className: 'Neo.form.field.Email',
        /**
         * @member {String} ntype='emailfield'
         * @protected
         */
        ntype: 'emailfield',
        /**
         * @member {String} errorTextValidEmail='Not a valid email address'
         */
        errorTextValidEmail: 'Not a valid email address',
        /**
         * @member {String} inputType='email'
         */
        inputType: 'email'
    }

    /**
     * Checks for client-side field errors
     * @param {Boolean} silent=true
     * @returns {Boolean} Returns true in case there are no client-side errors
     */
    validate(silent=true) {
        let me          = this,
            returnValue = super.validate(silent);

        if (returnValue) {
            if (!Email.emailRegex.test(me.value)) {
                me._error = me.errorTextValidEmail;
                returnValue = false;
            }
        }

        !returnValue && !me.clean && me.updateError(me._error, silent);

        return returnValue
    }
}

Neo.applyClassConfig(Email);

export default Email;
