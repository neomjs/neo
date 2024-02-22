import StringUtil from '../../util/String.mjs';
import Text       from './Text.mjs';

/**
 *
 * @class Neo.form.field.TextArea
 * @extends Neo.form.field.Text
 * @abstract
 */
class TextArea extends Text {
    /**
     * Valid values for wrap
     * @member {String[]} wrapValues=['hard', 'off', 'soft', null]
     * @protected
     * @static
     */
    static wrapValues = ['hard', 'off', 'soft', null]

    static config = {
        /**
         * @member {String} className='Neo.form.field.TextArea'
         * @protected
         */
        className: 'Neo.form.field.TextArea',
        /**
         * @member {String} ntype='textarea'
         * @protected
         */
        ntype: 'textarea',
        /**
         * Set this to `true` to have the text area grow and shrink to accommodate
         * any height of text. Bounds can be set using the `minHeight` and `maxHeight` settings.
         * @member {Boolean} autoGrow=false
         */
        autoGrow_: false,
        /**
         * @member {String[]} baseCls=['neo-textarea','neo-textfield']
         */
        baseCls: ['neo-textarea', 'neo-textfield'],
        /**
         * True shows a clear trigger in case the field has a non-empty value.
         * @member {Boolean} clearable=false
         */
        clearable: false,
        /**
         * The visible width of the text control, in average character widths.
         * If it is specified, it must be a positive integer.
         * If it is not specified, the default value is 20.
         * @member {Number|null} cols_=null
         */
        cols_: null,
        /**
         * @member {String} inputTag_='textarea'
         */
        inputTag_: 'textarea',
        /**
         * Disabling to set a type for the textarea tag
         * See: inputTag_
         * @member {String|null} inputType=null
         * @protected
         */
        inputType: null,
        /**
         * Use false to disable the browsers default resizing feature
         * @member {Boolean} resizable_=false
         */
        resizable_: false,
        /**
         * An integer > 0 or null
         * @member {Number|null} rows_=3
         */
        rows_: 3,
        /**
         * Indicates how the control wraps text. Possible values are: hard, soft, off
         * If this attribute is not specified, soft is its default value.
         * https://developer.mozilla.org/en-US/docs/Web/HTML/Element/textarea
         * @member {String|null} wrap_=null
         */
        wrap_: null
    }

    /**
     * Triggered after the autoGrow config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetAutoGrow(value, oldValue) {
        let me = this;

        value && me.syncAutoGrowMonitor();

        // Restore any configured height if autoGrow turned off
        if (!value) {
            me.afterSetHeight(me._height);
        }
    }

    /**
     * Triggered after the cols config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetCols(value, oldValue) {
        this.changeInputElKey('cols', value);
    }

    /**
     * Triggered after the inputTag config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetInputTag(value, oldValue) {
        this.changeInputElKey('tag', value);
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        this.syncAutoGrowMonitor();
    }

    /**
     * Triggered after the resizable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetResizable(value, oldValue) {
        let me    = this,
            style = this.getInputEl().style;

        style.resize = value ? null : 'none';
        me.update();
    }

    /**
     * Triggered after the rows config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetRows(value, oldValue) {
        this.changeInputElKey('rows', value);
    }

    /**
     * Triggered after the value config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me      = this,
            inputEl = me.getInputEl();

        if (inputEl) {
            inputEl.html = StringUtil.escapeHtml(value);
        }

        super.afterSetValue(value, oldValue);

        if (me.autoGrow && me.mounted && me.readOnly) {
            setTimeout(() => {
                Neo.main.DomAccess.monitorAutoGrowHandler({
                    appName : me.appName,
                    id      : inputEl.id,
                    windowId: me.windowId
                })
            }, 50)
        }
    }

    /**
     * Triggered after the wrap config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWrap(value, oldValue) {
        this.changeInputElKey('wrap', value);
    }

    /**
     * Checks if the new wrap value matches a value of the static wrapValues config
     * @param {String} value
     * @param {String} oldValue
     * @returns {String} value
     * @protected
     */
    beforeSetWrap(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'wrap', 'wrapValues');
    }

    /**
     *
     */
    async syncAutoGrowMonitor() {
        let me = this;

        if (me.mounted && me.autoGrow) {
            // Delegate monitoring of sizes to the main thread.
            Neo.main.DomAccess.monitorAutoGrow({
                appName  : me.appName,
                id       : me.getInputElId(),
                autoGrow : me.autoGrow
            })
        }
    }
}

Neo.setupClass(TextArea);

export default TextArea;
