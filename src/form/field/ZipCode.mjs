import Text from './Text.mjs';

/**
 * An extended form.field.Text which uses an input pattern to limit the amount of character which users can enter.
 * The first version will only support numbers. Feel free to open feature requests.
 * @class Neo.form.field.ZipCode
 * @extends Neo.form.field.Text
 */
class ZipCode extends Text {
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
         * @member {Neo.form.field.Base|String|null} countryField_=null
         */
        countryField_: null
    }

    /**
     * Triggered after the countryField config got changed
     * @param {Neo.form.field.Base|null} value
     * @param {Neo.form.field.Base|null} oldValue
     * @protected
     */
    afterSetCountryField(value, oldValue) {

    }

    /**
     * Triggered before the countryField config gets changed
     * @param {Neo.form.field.Base|String|null} value
     * @param {Neo.form.field.Base|String|null} oldValue
     * @returns {Neo.form.field.Base|null}
     * @protected
     */
    beforeSetCountryField(value, oldValue) {
        console.log(value);
        return value;
    }
}

Neo.applyClassConfig(ZipCode);

export default ZipCode;
