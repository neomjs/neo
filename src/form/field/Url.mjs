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
         * Specify allowed protocols.
         * 'none' means that user inputs like "www.google.com" will be considered as valid.
         * @member {String[]} protocols=['http:','https:','none']
         */
        protocols: ['http:', 'https:', 'none']
    }

    /**
     * Triggered when accessing the value config
     * The default URL ctor has some sanity checks to convert an "almost" valid URL into a real one.
     * E.g. new URL("http:www.google.com").href => "http://www.google.com"
     * @param {String|null} value
     * @returns {String|null}
     * @protected
     */
    beforeGetValue(value) {
        if (value) {
            let me   = this,
                href = me.getUrl(value)?.href;

            if (!href && me.protocols.includes('none')) {
                href = me.getUrl(`https://${value}`)?.href;

                if (href) {
                    href = href.replace('https://', '')
                }
            }

            if (href) {
                return href
            }
        }

        return value
    }

    /**
     * Returns false in case an URL could not get created
     * @param {String} value
     * @returns {Boolean|URL}
     */
    getUrl(value) {
        let url;

        try {
            url = new URL(value);
        } catch(e) {
            return false
        }

        return url
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
        let me  = this,
            url = me.getUrl(value);

        if (!url && me.protocols.includes('none')) {
            url = me.getUrl(`https://${value}`);console.log(url)
        }

        if (!url) {
            return false
        }

        return me.protocols.includes(url.protocol)
    }
}

Neo.applyClassConfig(Url);

export default Url;
