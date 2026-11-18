import Button    from '../../../src/button/Base.mjs';
import Component from '../../../src/component/Base.mjs';
import Container from '../../../src/container/Base.mjs';

/**
 * @summary The Calculator app: a display over a keypad that adds, subtracts, multiplies and divides, one operation
 * at a time, as a pocket calculator does.
 * @class Neo.examples.desktop.basic.Calculator
 * @extends Neo.container.Base
 */
class Calculator extends Container {
    static config = {
        /**
         * @member {String} className='Neo.examples.desktop.basic.Calculator'
         * @protected
         */
        className: 'Neo.examples.desktop.basic.Calculator',
        /**
         * @member {String[]} cls=['desktop-basic-calculator']
         */
        cls: ['desktop-basic-calculator'],
        /**
         * What the display shows: the number being typed, or the last result
         * @member {String} display_='0'
         * @reactive
         */
        display_: '0',
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Component,
            cls   : ['desktop-basic-calculator-display'],
            flag  : 'display',
            flex  : 'none',
            text  : '0'
        }, {
            module: Container,
            cls   : ['desktop-basic-calculator-keys'],
            flex  : 1,
            // Digits and functions are ghost keys; the operators keep the theme's accent (`ui: null`)
            itemDefaults: {module: Button, handler: 'up.onKey', ui: 'ghost'},
            layout      : {ntype: 'grid'},
            items       : [
                {text: 'C', cls: ['desktop-basic-calculator-function']},
                {text: '⌫', cls: ['desktop-basic-calculator-function']},
                {text: '%', cls: ['desktop-basic-calculator-function']},
                {text: '÷', ui : null},
                {text: '7'}, {text: '8'}, {text: '9'},
                {text: '×', ui : null},
                {text: '4'}, {text: '5'}, {text: '6'},
                {text: '−', ui : null},
                {text: '1'}, {text: '2'}, {text: '3'},
                {text: '+', ui : null},
                {text: '0', cls: ['desktop-basic-calculator-zero']},
                {text: '.'},
                {text: '=', ui : null}
            ]
        }]
    }

    /**
     * The left operand of the pending operation
     * @member {Number|null} #accumulator=null
     */
    #accumulator = null
    /**
     * True when the next digit starts a new number instead of extending the shown one
     * @member {Boolean} #fresh=true
     */
    #fresh = true
    /**
     * The pending operation's key: `+`, `−`, `×` or `÷`
     * @member {String|null} #operator=null
     */
    #operator = null

    /**
     * Triggered after the display config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDisplay(value, oldValue) {
        this.down({flag: 'display'})?.set({text: value})
    }

    /**
     * @param {Number} a
     * @param {Number} b
     * @param {String} operator `+`, `−`, `×` or `÷`
     * @returns {Number}
     */
    calculate(a, b, operator) {
        switch (operator) {
            case '+': return a + b;
            case '−': return a - b;
            case '×': return a * b;
            case '÷': return a / b
        }
    }

    /**
     * A result as the display shows it: twelve significant digits drop float noise such as `0.1 + 0.2`, and a
     * division by zero reads `Error`
     * @param {Number} value
     * @returns {String}
     */
    format(value) {
        return Number.isFinite(value) ? String(Number(value.toPrecision(12))) : 'Error'
    }

    /**
     * Applies a key: a digit or the point extends the number being typed, an operator applies the pending one first,
     * `=` finishes the operation, `C` clears, `⌫` removes the last digit and `%` divides by a hundred
     * @param {Object} data
     * @param {Neo.button.Base} data.component The key
     */
    onKey({component}) {
        let me     = this,
            {text} = component,
            shown  = me.display === 'Error' ? '0' : me.display;

        if (/^\d$/.test(text)) {
            me.display = me.#fresh || shown === '0' ? text : shown + text;
            me.#fresh  = false
        } else if (text === '.') {
            me.display = me.#fresh ? '0.' : shown.includes('.') ? shown : shown + '.';
            me.#fresh  = false
        } else if (text === 'C') {
            me.#accumulator = null;
            me.#operator    = null;
            me.#fresh       = true;
            me.display      = '0'
        } else if (text === '⌫') {
            if (!me.#fresh) {
                me.display = shown.slice(0, -1) || '0'
            }
        } else if (text === '%') {
            me.display = me.format(Number(shown) / 100);
            me.#fresh  = true
        } else {
            // An operator, or `=`: the pending operation runs once its right operand was typed
            if (me.#operator && !me.#fresh) {
                me.display = me.format(me.calculate(me.#accumulator, Number(shown), me.#operator))
            }

            me.#accumulator = text === '=' || me.display === 'Error' ? null : Number(me.display);
            me.#operator    = text === '=' || me.display === 'Error' ? null : text;
            me.#fresh       = true
        }
    }
}

export default Neo.setupClass(Calculator);
