import Select from '../../form/field/Select.mjs';

/**
 * @class Neo.form.field.Country
 * @extends Neo.form.field.Select
 */
class Country extends Select {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Country'
         * @protected
         */
        className: 'Neo.form.field.Country',
        /**
         * @member {String} ntype='countryfield'
         * @protected
         */
        ntype: 'countryfield',
        /**
         * You can either pass a field instance or a field reference
         * @member {Neo.form.field.Base|String|null} zipCodeField_=null
         */
        zipCodeField_: null
    }

    /**
     * Triggered after the zipCodeField config got changed
     * @param {Neo.form.field.Base|null} value
     * @param {Neo.form.field.Base|null} oldValue
     * @protected
     */
    afterSetZipCodeField(value, oldValue) {
        if (value && value instanceof Neo.form.field.Base) {
            value.countryField = this
        }
    }

    /**
     * Triggered before the zipCodeField config gets changed
     * @param {Neo.form.field.Base|String|null} value
     * @param {Neo.form.field.Base|String|null} oldValue
     * @returns {Neo.form.field.Base|null}
     * @protected
     */
    beforeSetZipCodeField(value, oldValue) {
        let me = this;

        if (Neo.isString(value)) {
            return me.up().getReference(value)
        }

        return value;
    }
}

Neo.applyClassConfig(Country);

export default Country;
