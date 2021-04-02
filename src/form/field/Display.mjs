import Text from './Text.mjs';

/**
 * An extended form.field.Text, which is read-only.
 * @class Neo.form.field.Display
 * @extends Neo.form.field.Text
 * @abstract
 */
class Display extends Text {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.Display'
         * @protected
         */
        className: 'Neo.form.field.Display',
        /**
         * @member {String} ntype='displayfield'
         * @protected
         */
        ntype: 'displayfield',
        /**
         * @member {Boolean} clearable=false
         * @protected
         */
        clearable: false,
        /**
         * @member {String[]} cls=['neo-displayfield','neo-textfield']
         */
        cls: ['neo-displayfield', 'neo-textfield']
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me      = this,
            vdom    = me.vdom,
            inputEl = me.getInputEl();

        inputEl.readonly = 'readonly';
        inputEl.tabindex = '-1';

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(Display);

export {Display as default};