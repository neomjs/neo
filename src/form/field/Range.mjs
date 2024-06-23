import Number from './Number.mjs';

/**
 * @class Neo.form.field.Range
 * @extends Neo.form.field.Number
 */
class Range extends Number {
    /**
     * Removing the debounce for range fields
     * @member {Object} delayable
     * @protected
     * @static
     */
    static delayable = {}

    static config = {
        /**
         * @member {String} className='Neo.form.field.Range'
         * @protected
         */
        className: 'Neo.form.field.Range',
        /**
         * @member {String} ntype='rangefield'
         * @protected
         */
        ntype: 'rangefield',
        /**
         * @member {String[]} baseCls=['neo-rangefield','neo-textfield']
         */
        baseCls: ['neo-rangefield', 'neo-textfield'],
        /**
         * True shows a clear trigger in case the field has a non empty value.
         * @member {Boolean} clearable=false
         */
        clearable: false,
        /**
         * Value for the inputType_ textfield config
         * @member {String} inputType='range'
         */
        inputType: 'range',
        /**
         * If true, shows the result of the slider in the label
         * @member {Boolean} showResultInLabel=false
         */
        showResultInLabel: false,
        /**
         * @member {Array} tickmarks_=[]
         */
        tickmarks_: [],
        /**
         * @member {Boolean} useInputEvent=false
         */
        useInputEvent: false,
        /**
         * Disables the field.Number buttons
         * @member {Boolean} useInputEvent=false
         */
        useSpinButtons: false
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            inputEl = me.vdom.cn[2];

        if (me.useInputEvent) {
            me.addDomListeners({
                input: {
                    fn   : me.onInputValueChange,
                    id   : me.vdom.cn[2].id,
                    scope: me
                }
            });
        }

        inputEl.cls = ['neo-rangefield-input']; // replace neo-textfield-input

        me.addValueToLabel()
    }

    /**
     * Triggered after the tickmarks config got changed
     * @param {Array} value
     * @param {Array} oldValue
     * @protected
     */
    afterSetTickmarks(value, oldValue) {
        // todo
    }

    /**
     * Triggered after the value config got changed
     * @param {Number} value
     * @param {Number} oldValue
     */
    afterSetValue(value, oldValue) {
        this.addValueToLabel();
        super.afterSetValue(value, oldValue)
    }

    /**
     * Update label with value
     */
    addValueToLabel() {
        let me = this;

        if (me.showResultInLabel) {
            me.getLabelEl().innerHTML = `[${me.value}] ` + me.labelText
        }
    }
}

Neo.setupClass(Range);

export default Range;
