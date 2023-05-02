import Text from './Text.mjs';

/**
 * An extended form.field.Text which creates an HTML5 url input. Most browsers will show a specialized
 * virtual keyboard for web address input.
 * @class Neo.form.field.Url
 * @extends Neo.form.field.Text
 */
class Url extends Text {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Url'
         * @protected
         */
        className: 'Neo.form.field.Url',
        /**
         * @member {String} ntype='urlfield'
         * @protected
         */
        ntype: 'urlfield',
        /**
         * @member {String} errorTextValidUrl='Not a valid URL'
         */
        errorTextValidUrl: 'Not a valid URL',
        /**
         * Value for the inputType_ textfield config
         * @member {String} inputType='url'
         */
        inputType: 'url',
        /**
         * Specify allowed protocols
         * @member {String[]} protocols=['http:','https:']
         */
        protocols: ['http:', 'https:']
    }

    /**
     * Checks for client-side field errors
     * @param {Boolean} silent=true
     * @returns {Boolean} Returns true in case there are no client-side errors
     */
    validate(silent=true) {
        let me          = this,
            returnValue = super.validate(silent),
            value       = me.value;

        if (returnValue) {
            if (value && !me.verifyUrl(value)) {
                me._error = me.errorTextValidUrl;
                returnValue = false;
            }
        }

        !returnValue && !me.clean && me.updateError(me._error, silent);

        return returnValue
    }

    /**
     * @param {String} value
     * @returns {Boolean}
     */
    verifyUrl(value) {
        let url;

        try {
            url = new URL(value);
        } catch(e) {
            return false
        }

        return this.protocols.includes(url.protocol)
    }
}

Neo.applyClassConfig(Url);

export default Url;
