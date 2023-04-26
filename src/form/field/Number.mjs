import SpinDownTrigger   from './trigger/SpinDown.mjs';
import SpinUpTrigger     from './trigger/SpinUp.mjs';
import SpinUpDownTrigger from './trigger/SpinUpDown.mjs';
import Text              from './Text.mjs';

/**
 * Uses an input type number and optionally provides custom spin buttons for up and down
 * @class Neo.form.field.Number
 * @extends Neo.form.field.Text
 */
class Number extends Text {
    /**
     * Valid values for triggerPosition
     * @member {String[]} triggerPositions=['right', 'sides']
     * @protected
     * @static
     */
    static triggerPositions = ['right', 'sides']

    static config = {
        /**
         * @member {String} className='Neo.form.field.Number'
         * @protected
         */
        className: 'Neo.form.field.Number',
        /**
         * @member {String} ntype='numberfield'
         * @protected
         */
        ntype: 'numberfield',
        /**
         * @member {String[]} baseCls=['neo-numberfield','neo-textfield']
         */
        baseCls: ['neo-numberfield', 'neo-textfield'],
        /**
         * data passes maxLength, minLength & valueLength properties
         * @member {Function} errorTextMaxValue=data=>`Max value violation: ${data.value} / ${data.maxValue}`
         */
        errorTextMaxValue: data => `Max value violation: ${data.value} / ${data.maxValue}`,
        /**
         * data passes maxLength, minLength & valueLength properties
         * @member {Function} errorTextMinValue=data=>`Min value violation: ${data.value} / ${data.minValue}`
         */
        errorTextMinValue: data => `Min value violation: ${data.value} / ${data.minValue}`,
        /**
         * @member {String} errorTextStepSize='Required'
         */
        errorTextStepSize: data => `step-size violation: ${data.value} / ${data.stepSize}`,
        /**
         * @member {Number[]|null} excluded=null
         */
        excludedValues: null,
        /**
         * false only allows changing the field using the spin buttons
         * @member {Boolean} inputEditable_=true
         */
        inputEditable_: true,
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
    }

    /**
     * @member {Number|null} stepSizeDigits=null
     */
    stepSizeDigits = null

    /**
     * Triggered after the inputEditable config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetInputEditable(value, oldValue) {
        let me      = this,
            inputEl = me.getInputEl(),
            style   = inputEl.style || {};

        if (value) {
            delete style.pointerEvents;
        } else {
            style.pointerEvents = 'none';
        }

        me.update();
    }

    /**
     * Triggered after the maxValue config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetMaxValue(value, oldValue) {
        this.validate(); // silent
        this.changeInputElKey('max', value);
    }

    /**
     * Triggered after the minValue config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetMinValue(value, oldValue) {
        this.validate(); // silent
        this.changeInputElKey('min', value);
    }

    /**
     * Triggered after the stepSize config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetStepSize(value, oldValue) {
        let me  = this,
            val = me.value,
            modulo, stepSizeString;

        me.changeInputElKey('step', value);

        stepSizeString = String(this.stepSize);

        me.stepSizeDigits = stepSizeString.includes('.') ? stepSizeString.split('.')[1].length : 0;

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
     * Triggered before the maxLength config gets changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    beforeSetMaxLength(value, oldValue) {
        if (value !== null) {
            console.warn('input type number does not support maxLength. use maxValue instead.', this)
        }

        return null;
    }

    /**
     * Triggered before the minLength config gets changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    beforeSetMinLength(value, oldValue) {
        if (value !== null) {
            console.warn('input type number does not support minLength. use minValue instead.', this)
        }

        return null;
    }

    /**
     * Triggered after the triggerPosition config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTriggerPosition(value, oldValue) {
        oldValue && this.updateTriggers();
    }

    /**
     * Triggered after the useSpinButtons config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseSpinButtons(value, oldValue) {
        if (typeof oldValue === 'boolean') {
            this.updateTriggers();
        }
    }

    /**
     * Triggered before the triggerPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetTriggerPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'triggerPosition');
    }

    /**
     * Triggered before the value config gets changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    beforeSetValue(value, oldValue) {
        if (Neo.isNumber(value) && this.stepSizeDigits > 0) {
            return +value.toFixed(this.stepSizeDigits);
        }

        return value;
    }

    /**
     * @returns {Boolean}
     */
    isValid() {
        let me       = this,
            maxValue = me.maxValue,
            minValue = me.minValue,
            value    = me.value,
            isNumber = Neo.isNumber(value);

        if (Neo.isNumber(maxValue) && isNumber && value > maxValue) {
            return false;
        }

        if (Neo.isNumber(minValue) && isNumber && value < minValue) {
            return false;
        }

        if (value % me.stepSize !== 0) {
            return false;
        }

        return super.isValid();
    }

    /**
     *
     */
    onConstructed() {
        this.updateTriggers();
        super.onConstructed();
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.oldPath
     * @protected
     */
    onFocusLeave(data) {
        let me          = this,
            stepSizePow = Math.pow(10, me.stepSizeDigits),
            value       = me.value;

        if (value !== null) {
            value = me.stepSizeDigits > 0 ? parseFloat(value) : parseInt(value);
            value = value - Math.round((value % me.stepSize) * stepSizePow) / stepSizePow;
            value = Math.max(me.minValue, value);
            value = Math.min(me.maxValue, value);

            me.value = value;
        }

        super.onFocusLeave(data)
    }

    /**
     * @protected
     */
    onSpinButtonDownClick() {
        let me       = this,
            stepSize = me.stepSize,
            oldValue = Neo.isNumber(me.value) ? me.value : me.minValue,
            value    = (oldValue - stepSize) < me.minValue ? me.maxValue : (oldValue - stepSize);

        if (me.excludedValues) {
            while (me.excludedValues.includes(value)) {
                value = Math.max(me.minValue, value - stepSize);
            }
        }

        if (oldValue !== value) {
            me.value = value;
        }
    }

    /**
     * @protected
     */
    onSpinButtonUpClick() {
        let me       = this,
            stepSize = me.stepSize,
            oldValue = Neo.isNumber(me.value) ? me.value : me.maxValue,
            value    = (oldValue + stepSize) > me.maxValue ? me.minValue : (oldValue + stepSize);

        if (me.excludedValues) {
            while (me.excludedValues.includes(value)) {
                value = Math.min(me.maxValue, value + stepSize);
            }
        }

        if (oldValue !== value) {
            me.value = value;
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

    /**
     * Checks for client-side field errors
     * @param {Boolean} silent=true
     * @returns {Boolean} Returns true in case there are no client-side errors
     */
    validate(silent=true) {
        let me          = this,
            value       = me.value,
            isNumber    = Neo.isNumber(value),
            maxValue    = me.maxValue,
            minValue    = me.minValue,
            stepSize    = me.stepSize,
            stepSizePow = Math.pow(10, me.stepSizeDigits),
            returnValue = super.validate(silent),
            errorParam  = {maxValue, minValue, stepSize, value};

        if (returnValue) {
            if (Neo.isNumber(maxValue) && isNumber && value > maxValue) {
                me._error = me.errorTextMaxValue(errorParam);
                returnValue = false;
            } else if (Neo.isNumber(minValue) && isNumber && value < minValue) {
                me._error = me.errorTextMinValue(errorParam);
                returnValue = false;
            } else if ((Math.round((value % me.stepSize) * stepSizePow) / stepSizePow) !== 0) {
                me._error = me.errorTextStepSize(errorParam);
                returnValue = false;
            }
        }

        !returnValue && !me.clean && me.updateError(me._error, silent);

        return returnValue
    }
}

Neo.applyClassConfig(Number);

export default Number;
