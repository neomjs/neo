import Text from './Text.mjs';

/**
 * @summary An extended form.field.Text which uses country-specific input patterns to validate International Bank Account Numbers (IBAN).
 *
 * The initial `countryCodes` map supports `AT`, `CH`, and `DE` (both electronic format without spaces and
 * print format with single spaces between 4-character groups). Feel free to open feature requests for additional countries.
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
         * You can either pass a field instance or a field reference
         * @member {Neo.form.field.Base|String|null} countryField_=null
         * @reactive
         */
        countryField_: null,
        /**
         * The data.Model field inside the related country field which provides the country code (e.g. 'DE')
         * @member {String} countryKeyProperty='id'
         */
        countryKeyProperty: 'id',
        /**
         * data passes inputPattern, maxLength, minLength & valueLength properties
         * @member {Function} errorTextInputPattern=data=>'Not a valid IBAN'
         */
        errorTextInputPattern: data => 'Not a valid IBAN'
    }

    /**
     * Triggered after the countryCode config got changed
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
     * Triggered after the countryField config got changed
     * @param {Neo.form.field.Base|null} value
     * @param {Neo.form.field.Base|null} oldValue
     * @protected
     */
    afterSetCountryField(value, oldValue) {
        let me = this;

        oldValue?.un('change', me.onCountryFieldChange, me);

        if (value) {
            value.on({
                change: me.onCountryFieldChange,
                scope : me
            });

            value.value && me.onCountryFieldChange({
                component: value,
                record   : value.record,
                value    : value.value
            })
        }
    }

    /**
     * Triggered before the countryField config gets changed
     * @param {Neo.form.field.Base|String|null} value
     * @param {Neo.form.field.Base|String|null} oldValue
     * @returns {Neo.form.field.Base|null}
     * @protected
     */
    beforeSetCountryField(value, oldValue) {
        let me = this;

        if (Neo.isString(value)) {
            return me.up().getReference(value)
        }

        return value
    }

    /**
     * @param {Object} data
     */
    onCountryFieldChange(data) {
        this.countryCode = data.record?.[this.countryKeyProperty] || null
    }
}

export default Neo.setupClass(IBAN);
