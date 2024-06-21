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
         */
        clearable: false
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            inputEl = me.getInputEl();

        inputEl.readonly = 'readonly';
        inputEl.tabindex = '-1';

        me.update()
    }
}

Neo.setupClass(Display);

export default Display;
