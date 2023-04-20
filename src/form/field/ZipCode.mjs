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
         * @member {RegExp|null} inputPattern=null
         */
        inputPattern: /[0-9]*/
    }
}

Neo.applyClassConfig(ZipCode);

export default ZipCode;
