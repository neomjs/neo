import {default as SpinDownTrigger}   from './trigger/SpinDown.mjs';
import {default as SpinUpTrigger}     from './trigger/SpinUp.mjs';
import {default as SpinUpDownTrigger} from './trigger/SpinUpDown.mjs';
import Text                           from './Text.mjs';

/**
 * Uses an input type number and optionally provides custom spin buttons for up and down
 * @class Neo.form.field.Number
 * @extends Neo.form.field.Text
 */
class Number extends Text {
    static getStaticConfig() {return {
        /**
         * Valid values for triggerPosition
         * @member {String[]} triggerPositions=['right', 'sides']
         * @private
         * @static
         */
        triggerPositions: ['right', 'sides']
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.Number'
         * @private
         */
        className: 'Neo.form.field.Number',
        /**
         * @member {String} ntype='numberfield'
         * @private
         */
        ntype: 'numberfield',
        /**
         * @member {Array} cls=['neo-numberfield', 'neo-textfield']
         */
        cls: ['neo-numberfield', 'neo-textfield'],
        /**
         * Value for the inputType_ textfield config
         * @member {String} inputType='number'
         */
        inputType: 'number',
        /**
         * @member {Number} maxValue_=100
         */
        maxValue_: 100,
        /**
         * @member {Number} minValue_=0
         */
        minValue_: 0,
        /**
         * @member {Number} stepSize_=1
         */
        stepSize_: 1,
        /**
         * Valid values: 'right', 'sides'
         * @member {String} triggerPosition='right'
         */
        triggerPosition_: 'right',
        /**
         * @member {Boolean} useSpinButtons_=true
         */
        useSpinButtons_: true
    }}

    /**
     *
     */
    onConstructed() {
        this.updateTriggers();
        super.onConstructed();
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @private
     */
    afterSetMaxValue(value, oldValue) {
        this.changeInputElKey('max', value);
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @private
     */
    afterSetMinValue(value, oldValue) {
        this.changeInputElKey('min', value);
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @private
     */
    afterSetStepSize(value, oldValue) {
        let me  = this,
            val = me.value,
            modulo;

        me.changeInputElKey('step', value);

        if (val !== null) {
            modulo = (val - me.minValue) % value;

            if (modulo !== 0) { // find the closest valid value
                if (modulo / value > 0.5) {
                    if      (val + value - modulo < me.maxValue) {me.value = val + value - modulo;}
                    else if (val - modulo > me.minValue)         {me.value = val - modulo;}
                } else {
                    if      (val - modulo > me.minValue)         {me.value = val - modulo;}
                    else if (val + value - modulo < me.maxValue) {me.value = val + value - modulo;}
                }
            }
        }
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetTriggerPosition(value, oldValue) {
        if (oldValue) {
            this.updateTriggers();
        }
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetUseSpinButtons(value, oldValue) {
        if (typeof oldValue === 'boolean') {
            this.updateTriggers();
        }
    }

    /**
     * Tiggered before the triggerPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    beforeSetTriggerPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'triggerPosition');
    }

    /**
     * @param {Object} data
     * @override
     */
    onInputValueChange(data) {
        let me       = this,
            value    = data.value,
            oldValue = me.value;

        if (!value && !me.required) {
            super.onInputValueChange(data);
        } else {
            value = parseInt(value); // todo: support for other number types

            if (!Neo.isNumber(value)) {
                me._value = oldValue;
            } else {
                value = value - value % me.stepSize;
                value = Math.max(me.minValue, value);
                value = Math.min(me.maxValue, value);

                data.value = value;

                super.onInputValueChange(data);
            }
        }
    }

    /**
     * @private
     */
    onSpinButtonClick(value, oldValue) {
        this.fire('change', {
            oldValue: oldValue,
            value   : value
        });
    }

    /**
     * @private
     */
    onSpinButtonDownClick() {
        let me       = this,
            oldValue = me.value || (me.maxValue + me.stepSize),
            value    = Math.max(me.minValue, oldValue - me.stepSize);

        if (oldValue !== value) {
            me.value = value;
            me.onSpinButtonClick(value, oldValue);
        }
    }

    /**
     * @private
     */
    onSpinButtonUpClick() {
        let me       = this,
            oldValue = me.value || (me.minValue - me.stepSize),
            value    = Math.min(me.maxValue, oldValue + me.stepSize);

        if (oldValue !== value) {
            console.log(value);

            me.value = value;
            me.onSpinButtonClick(value, oldValue);
        }
    }

    /**
     *
     */
    updateTriggers() {
        let me       = this,
            triggers = me.triggers || [];

        if (me.useSpinButtons) {
            if (me.triggerPosition === 'right') {
                if (!me.hasTrigger('spinupdown')) {
                    triggers.push(SpinUpDownTrigger);
                }

                me.removeTrigger('spindown', true, triggers);
                me.removeTrigger('spinup',   true, triggers);
            } else {
                if (!me.hasTrigger('spindown')) {
                    triggers.push(SpinDownTrigger);
                }

                if (!me.hasTrigger('spinup')) {
                    triggers.push(SpinUpTrigger);
                }

                me.removeTrigger('spinupdown', true, triggers);
            }
        } else {
            me.removeTrigger('spindown',   true, triggers);
            me.removeTrigger('spinup',     true, triggers);
            me.removeTrigger('spinupdown', true, triggers);
        }

        me.triggers = triggers;
    }
}

Neo.applyClassConfig(Number);

export {Number as default};