import Text from './Text.mjs';

/**
 * An extended form.field.Text which creates an HTML5 url input. Most browsers will show a specialized
 * virtual keyboard for web address input.
 * @class Neo.form.field.Url
 * @extends Neo.form.field.Text
 */
class Url extends Text {
    static getConfig() {return {
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
         * Value for the inputType_ textfield config
         * @member {String} inputType='url'
         */
        inputType: 'url'
    }}
}

Neo.applyClassConfig(Url);

export {Url as default};