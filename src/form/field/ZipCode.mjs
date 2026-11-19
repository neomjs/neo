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
        AT: /^\d{4}$/,
        CH: /^\d{4}$/,
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
         * The data.Model field inside the related country field which provides the country code (e.g. 'de' or 'DE')
         * @member {String} countryKeyProperty='code'
         */
        countryKeyProperty: 'code',
        /**
         * data passes inputPattern, maxLength, minLength & valueLength properties
         * @member {Function} errorTextInputPattern=data=>'Not a valid zip code'
         */
        errorTextInputPattern: (data) => 'Not a valid zip code'
    }

    /**
     * @summary Assigns `inputPattern` from `ZipCode.countryCodes` and re-validates dirty non-empty values.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCountryCode(value, oldValue) {
        let me = this;

        me.inputPattern = ZipCode.countryCodes[value] || null;

        oldValue !== undefined && me.value && !me.clean && me.validate(false)
    }

    /**
     * @summary Subscribes to `countryField` changes, detaching any prior field listener, and syncs `countryCode`.
     * @param {Neo.form.field.Base|null} value
     * @param {Neo.form.field.Base|null} oldValue
     * @protected
     */
    afterSetCountryField(value, oldValue) {
        let me = this;

        oldValue && !oldValue.isDestroyed && oldValue.un('change', me.onCountryFieldChange, me);

        if (value) {
            value.on({
                change: me.onCountryFieldChange,
                scope : me
            });

            me.onCountryFieldChange({
                component: value,
                record   : value.record,
                value    : value.value
            })
        }
    }

    /**
     * @summary Normalizes ISO country codes to trimmed uppercase strings (`'de'` -> `'DE'`).
     * @param {String|null} value
     * @returns {String|null}
     * @protected
     */
    beforeSetCountryCode(value) {
        if (Neo.isString(value)) {
            return value.trim().toUpperCase() || null
        }

        return value
    }

    /**
     * @summary Resolves string component references to the target country field instance.
     * @param {Neo.form.field.Base|String|null} value
     * @returns {Neo.form.field.Base|null}
     * @protected
     */
    beforeSetCountryField(value) {
        return this.resolveFieldReference(value, 'countryField')
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.countryField && !me.countryField.isDestroyed && me.countryField.un('change', me.onCountryFieldChange, me);
        super.destroy(...args)
    }

    /**
     * @summary Extracts the selected ISO country code from a `Country` / `ComboBox` record or string `change` payload.
     * @param {Object} data
     */
    onCountryFieldChange(data) {
        let me      = this,
            keyProp = me.countryKeyProperty,
            raw     = data?.record ?? data?.value,
            code    = null;

        if (Neo.isRecord(raw) || Neo.isObject(raw)) {
            code = raw[keyProp] ?? (keyProp === 'code' && Neo.isString(raw.id) ? raw.id : null)
        } else if (Neo.isString(raw)) {
            let trimmed = raw.trim(),
                store   = data?.component?.store;

            if (trimmed) {
                if (store) {
                    let lower  = trimmed.toLowerCase(),
                        record = store.get(lower) || store.get(trimmed) || store.get(trimmed.toUpperCase())
                            || store.find(data.component.displayField || 'name', lower)[0];

                    code = record
                        ? record[keyProp] ?? (keyProp === 'code' && Neo.isString(record.id) ? record.id : null)
                        : null
                } else {
                    code = trimmed
                }
            }
        }

        me.countryCode = code
    }
}

export default Neo.setupClass(ZipCode);
