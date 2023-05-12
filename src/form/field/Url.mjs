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
         * @member {String} errorTextInputPattern=data=>'Not a valid URL'
         */
        errorTextInputPattern: data => 'Not a valid URL',
        /**
         * @member {RegExp|null} inputPattern=/^(https?:\/\/)?(([a-zA-Z0-9_-]+\.)*([a-zA-Z0-9_-]+\.[a-zA-Z]{2,}))(\/([a-zA-Z0-9._-]+)\/?)*$/
         */
        inputPattern: /^(https?:\/\/)?(([a-zA-Z0-9_-]+\.)*([a-zA-Z0-9_-]+\.[a-zA-Z]{2,}))(\/([a-zA-Z0-9._-]+)\/?)*$/,
        /**
         * @member {Boolean} inputPatternDOM=false
         */
        inputPatternDOM: false,
        /**
         * Value for the inputType_ textfield config
         * @member {String} inputType='url'
         */
        inputType: 'url'
    }
}

Neo.applyClassConfig(Url);

export default Url;
