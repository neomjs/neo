import Number from './Number.mjs';

/**
 * @class Neo.form.field.Range
 * @extends Neo.form.field.Number
 */
class Range extends Number {
    static getConfig() {return {
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
         * True shows a clear trigger in case the field has a non empty value.
         * @member {Boolean} clearable=false
         */
        clearable: false,
        /**
         * @member {String[]} cls=['neo-rangefield','neo-textfield']
         */
        cls: ['neo-rangefield', 'neo-textfield'],
        /**
         * Value for the inputType_ textfield config
         * @member {String} inputType='range'
         */
        inputType: 'range',
        /**
         * @member {Array} tickmarks_=[]
         */
        tickmarks_: [],
        /**
         * @member {Boolean} useInputEvent=false
         */
        useInputEvent : false,
        /**
         * Disables the field.Number buttons
         * @member {Boolean} useInputEvent=false
         */
        useSpinButtons: false
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            inputEl = me.vdom.cn[1];

        if (me.useInputEvent) {
            me.addDomListeners({
                input: {
                    fn    : me.onInputValueChange,
                    id    : me.vdom.cn[1].id,
                    scope : me
                }
            });
        }

        inputEl.cls = ['neo-rangefield-input']; // replace neo-textfield-input
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
}

Neo.applyClassConfig(Range);

export default Range;
