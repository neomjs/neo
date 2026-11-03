import Text from './Text.mjs';

/**
 * @summary An extended form.field.Text which validates International Bank Account Numbers (IBAN) via country-specific input patterns and ISO 7064 MOD 97-10 check digits.
 *
 * The initial `countryCodes` map supports `AT`, `CH`, and `DE` (both electronic format without spaces and
 * print format with single spaces between 4-character groups), while `hasValidCheckDigits()` enforces the
 * ISO 7064 MOD 97-10 check-digit rule across all non-empty values regardless of `countryCode`. Feel free to
 * open feature requests for additional countries.
 * @class Neo.form.field.IBAN
 * @extends Neo.form.field.Text
 */
class IBAN extends Text {
    /**
     * @member {Object} countryCodes
     * @protected
     * @static
     */
    static countryCodes = {
        AT: /^AT\d{2}(?:\s?\d{4}){4}$/,
        CH: /^CH\d{2}\s?\d{4}\s?\d[A-Z0-9]{3}(?:\s?[A-Z0-9]{4}){2}\s?[A-Z0-9]$/,
        DE: /^DE\d{2}(?:\s?\d{4}){4}\s?\d{2}$/
    }

    static config = {
        /**
         * @member {String} className='Neo.form.field.IBAN'
         * @protected
         */
        className: 'Neo.form.field.IBAN',
        /**
         * @member {String} ntype='ibanfield'
         * @protected
         */
        ntype: 'ibanfield',
        /**
         * @member {String|null} countryCode_=null
         * @reactive
         */
        countryCode_: null,
        /**
         * data passes inputPattern, maxLength, minLength & valueLength properties
         * @member {Function} errorTextInputPattern=data=>'Not a valid IBAN'
         */
        errorTextInputPattern: data => 'Not a valid IBAN'
    }

    /**
     * @summary Verifies that an IBAN string satisfies the ISO 7064 MOD 97-10 check-digit rule.
     *
     * Spaces are stripped, the basic IBAN structure (`[A-Z]{2}\d{2}[A-Z0-9]{11,30}`) is verified,
     * the first four characters (country code and check digits) are moved to the end, letters `A`–`Z`
     * are expanded to `10`–`35`, and the resulting decimal integer modulo `97` must equal `1`.
     * @param {String} value
     * @returns {Boolean}
     * @static
     */
    static hasValidCheckDigits(value) {
        if (typeof value !== 'string') {
            return false
        }

        const compact = value.replace(/\s+/g, '');

        if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) {
            return false
        }

        const rearranged = compact.slice(4) + compact.slice(0, 4);
        let   remainder  = 0;

        for (let i = 0, len = rearranged.length; i < len; i++) {
            const code = rearranged.charCodeAt(i);

            if (code >= 48 && code <= 57) {
                remainder = (remainder * 10 + (code - 48)) % 97
            } else {
                remainder = (remainder * 100 + (code - 55)) % 97
            }
        }

        return remainder === 1
    }

    /**
     * @summary Assigns `inputPattern` from `countryCodes` for the selected country and re-validates dirty fields.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCountryCode(value, oldValue) {
        let me = this;

        me.inputPattern = me.constructor.countryCodes[value] || null;

        oldValue !== undefined && me.value && !me.clean && me.validate(false)
    }

    /**
     * @summary Validates the field against `Text` constraints (`required`, `minLength`, `maxLength`, `inputPattern`, `validator`) and ISO 7064 MOD 97-10 check digits.
     * @param {Boolean} silent=true
     * @returns {Boolean} Returns true in case there are no client-side errors
     */
    validate(silent=true) {
        let me          = this,
            returnValue = super.validate(silent),
            {value}     = me;

        if (returnValue && value && !me.constructor.hasValidCheckDigits(value)) {
            me._error = me.errorTextInputPattern({
                inputPattern: me.inputPattern,
                maxLength   : me.maxLength,
                minLength   : me.minLength,
                valueLength : value.toString().length
            });
            returnValue = false;

            !me.clean && me.updateError(me._error, silent)
        }

        return returnValue
    }
}

export default Neo.setupClass(IBAN);
