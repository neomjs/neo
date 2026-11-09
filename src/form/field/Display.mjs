import Text from './Text.mjs';

/**
 * An extended form.field.Text, which is read-only.
 * @class Neo.form.field.Display
 * @extends Neo.form.field.Text
 */
class Display extends Text {
    static config = {
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
         * @member {String[]} baseCls=['neo-displayfield','neo-textfield']
         */
        baseCls: ['neo-displayfield', 'neo-textfield'],
        /**
         * @member {Boolean} clearable=false
         * @protected
         * @reactive
         */
        clearable: false,
        /**
         * Uses the inherited reactive readonly path before the input is rendered.
         * @member {Boolean} readOnly=true
         * @reactive
         */
        readOnly: true
    }

    /**
     * @summary Keeps the display input outside sequential keyboard navigation.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            inputEl = me.getInputEl();

        inputEl.tabindex = '-1';

        me.update()
    }
}

export default Neo.setupClass(Display);
