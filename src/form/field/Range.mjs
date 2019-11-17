import Number from './Number.mjs';

/**
 * @class Neo.form.field.Range
 * @extends Neo.form.field.Number
 */
class Range extends Number {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.Range'
         * @private
         */
        className: 'Neo.form.field.Range',
        /**
         * @member {String} ntype='rangefield'
         * @private
         */
        ntype: 'rangefield',
        /**
         * True shows a clear trigger in case the field has a non empty value.
         * @member {Boolean} clearable=false
         */
        clearable: false,
        /**
         * @member {Array} cls=['neo-rangefield','neo-textfield']
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
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            domListeners = me.domListeners,
            inputEl      = me.vdom.cn[1];

        if (me.useInputEvent) {
            domListeners.push({
                input: {
                    fn    : me.onInputValueChange,
                    id    : me.vdom.cn[1].id,
                    scope : me
                }
            });

            me.domListeners = domListeners;
        }

        inputEl.cls = ['neo-rangefield-input']; // replace neo-textfield-input
    }

    /**
     *
     * @param {Array} value
     * @param {Array} oldValue
     * @private
     */
    afterSetTickmarks(value, oldValue) {
        //console.log('updateTickmarks');
    }
}

Neo.applyClassConfig(Range);

export {Range as default};