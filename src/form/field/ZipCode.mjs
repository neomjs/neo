import Text from './Text.mjs';

/**
 * An extended form.field.Text which uses an input pattern to limit the amount of character which users can enter.
 * The first version will only support numbers. Feel free to open feature requests.
 * @class Neo.form.field.ZipCode
 * @extends Neo.form.field.Text
 */
class ZipCode extends Text {
    /**
     * @member {Object} countryCodes
     * @protected
     * @static
     */
    static countryCodes = {
        DE: /^(?!01000|99999)(0[1-9]\d{3}|[1-9]\d{4})$/
    }

    static config = {
        /**
         * @member {String} className='Neo.form.field.ZipCode'
         * @protected
         */
        className: 'Neo.form.field.ZipCode',
        /**
         * @member {String} ntype='zipcodefield'
         * @protected
         */
        ntype: 'zipcodefield',
        /**
         * @member {String} countryCode_=null
         */
        countryCode_: null,
        /**
         * You can either pass a field instance or a field reference
         * @member {Neo.form.field.Base|String|null} countryField_=null
         */
        countryField_: null,
        /**
         * The data.Model field inside the related country field which provides the country code (e.g. 'DE')
         * @member {String} countryKeyProperty='id'
         */
        countryKeyProperty: 'id',
        /**
         * data passes inputPattern, maxLength, minLength & valueLength properties
         * @member {Function} errorTextInputPattern=data=>`Not a valid zip code`
         */
        errorTextInputPattern: data => `Not a valid zip code`
    }

    /**
     * Triggered after the countryCode config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCountryCode(value, oldValue) {
        let me = this;

        me.inputPattern = ZipCode.countryCodes[value] || null;

        !me.clean && me.validate(false);
    }

    /**
     * Triggered after the countryField config got changed
     * @param {Neo.form.field.Base|null} value
     * @param {Neo.form.field.Base|null} oldValue
     * @protected
     */
    afterSetCountryField(value, oldValue) {
        if (value) {
            let me = this;

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
        let me = this,
            field;

        if (Neo.isString(value)) {
            field = me.up().getReference(value);

            if (!field) {
                setTimeout(() => {
                    me.countryField = value;
                }, 20)
            }

            return field
        }

        return value;
    }

    /**
     * @param {Object} data
     */
    onCountryFieldChange(data) {
        this.countryCode = data.record?.[this.countryKeyProperty];
    }
}

Neo.applyClassConfig(ZipCode);

export default ZipCode;
