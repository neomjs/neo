import Button         from './Base.mjs';
import {isDescriptor} from '../core/ConfigSymbols.mjs';
import Toolbar        from '../toolbar/Base.mjs';

/**
 * @summary A single-choice segmented control. This labelled segmented button group exposes one bindable value.
 * Arrow keys and Home/End move focus between enabled buttons. Enter, Space or a click selects the focused choice.
 * Replace `choices` to change the set. A still-enabled selection survives replacement; otherwise the first
 * enabled choice is selected. An empty or entirely disabled set has value `null`.
 * @example
 *     // From examples/board/cardDesigns/Viewport.mjs
 *     import Segmented from '../../../src/button/Segmented.mjs';
 *     const density = {module: Segmented, ariaLabel: 'Density', value: 'compact', choices: [
 *         {value: 'compact', text: 'Compact'}, {value: 'roomy', text: 'Roomy'}
 *     ], listeners: {change: 'onDensityChange'}};
 * @class Neo.button.Segmented
 * @extends Neo.toolbar.Base
 */
class Segmented extends Toolbar {
    static config = {
        /** @member {String} className='Neo.button.Segmented' */
        className: 'Neo.button.Segmented',
        /** @member {String} ntype='segmented-button' */
        ntype: 'segmented-button',
        /**
         * Accessible name of the choice group.
         * @member {String|null} ariaLabel_=null
         * @reactive
         */
        ariaLabel_: null,
        /** @member {String[]} baseCls=['neo-toolbar','neo-segmented-button'] */
        baseCls: ['neo-toolbar', 'neo-segmented-button'],
        /**
         * Ordered choices, each with a unique string `value`, a text label and an optional boolean `disabled`.
         * @member {Object[]} choices_=[]
         * @reactive
         */
        choices_: {[isDescriptor]: true, cloneOnGet: 'none', value: []},
        /** @member {Boolean} keyboardNavigation=true */
        keyboardNavigation: true,
        /**
         * Selected choice. Writing an unknown or disabled value keeps the current enabled selection.
         * @member {String|null} value_=null
         * @reactive
         */
        value_: null
    }

    /**
     * @summary Projects the accessible toolbar name to its root.
     * @param {String|null} value
     * @protected
     */
    afterSetAriaLabel(value) {
        this.changeVdomRootKey('aria-label', value)
    }

    /**
     * @summary Reconciles buttons by choice value, retaining focusable instances across label changes and reorder.
     * @param {Object[]} choices
     * @protected
     */
    afterSetChoices(choices) {
        if (!this.isConstructed) return;

        const byValue = new Map(this.items.filter(button => button.segmentValue !== undefined).map(button => [button.segmentValue, button])),
              next    = this.resolveValue(this.value);

        choices.forEach((choice, index) => {
            const button = byValue.get(choice.value);

            if (button) {
                byValue.delete(choice.value);
                this.moveTo(this.items.indexOf(button), index);
                button.set({disabled: this.disabled || choice.disabled, pressed: choice.value === next, text: choice.text})
            } else {
                this.insert(index, this.createChoice(choice, next), true)
            }
        });
        for (const button of byValue.values()) this.remove(button, true, true);

        this.update();
        this.value = next
    }

    /**
     * @summary Disabling the group disables its buttons while retaining the selected choice.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        super.afterSetDisabled(value, oldValue);
        if (this.isConstructed) {
            const disabled = new Set(this.choices.filter(choice => choice.disabled).map(choice => choice.value));
            for (const button of this.items) {
                if (button.segmentValue !== undefined) button.disabled = value || disabled.has(button.segmentValue)
            }
        }
    }

    /**
     * @summary Applies one selected state and emits one change event per effective transition.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @fires change
     * @protected
     */
    afterSetValue(value, oldValue) {
        if (this.isConstructed && oldValue !== undefined) {
            for (const button of this.items) {
                if (button.segmentValue !== undefined) button.pressed = button.segmentValue === value
            }
            this.fire('change', {component: this, value, oldValue})
        }
    }

    /**
     * @summary Validates and snapshots all descriptors before replacing a live group.
     * @param {Object[]} choices
     * @returns {Object[]}
     * @protected
     */
    beforeSetChoices(choices) {
        if (!Array.isArray(choices)) throw new TypeError('Segmented choices must be an array');

        const seen = new Set();
        return Object.freeze(Array.from(choices, choice => {
            if (!choice || typeof choice.value !== 'string' || !choice.value.trim() ||
                typeof choice.text !== 'string' || !choice.text.trim() ||
                (choice.disabled !== undefined && typeof choice.disabled !== 'boolean')) {
                throw new TypeError('Each segmented choice needs a value, text and optional boolean disabled')
            }
            if (seen.has(choice.value)) throw new Error('Duplicate segmented choice: ' + choice.value);
            seen.add(choice.value);
            return Object.freeze({value: choice.value, text: choice.text, disabled: choice.disabled === true})
        }))
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @returns {String|null}
     * @protected
     */
    beforeSetValue(value, oldValue) {
        return this.isConstructed ? this.resolveValue(value, oldValue) : value
    }

    /**
     * @summary Creates the standard button whose native activation selects this choice.
     * @param {Object} choice
     * @param {String|null} selection
     * @returns {Object}
     * @protected
     */
    createChoice(choice, selection) {
        const {value} = choice;
        return {
            module  : Button,
            disabled: this.disabled || choice.disabled,
            handler : () => {
                if (!this.disabled) this.value = value
            },
            pressed     : value === selection,
            segmentValue: value,
            text        : choice.text
        }
    }

    /**
     * @summary Resolves the initial choice after both configs are available and before Toolbar creates its children.
     * @protected
     */
    onConstructed() {
        const selection = this.resolveValue(this.value);
        this.value = selection;
        this.items = this.choices.map(choice => this.createChoice(choice, selection));
        super.onConstructed()
    }

    /**
     * @param {String|null} value
     * @param {String|null} [previous]
     * @returns {String|null}
     * @protected
     */
    resolveValue(value, previous) {
        const enabled = this.choices.filter(choice => !choice.disabled);
        return (enabled.find(choice => choice.value === value) ||
            enabled.find(choice => choice.value === previous) || enabled[0])?.value ?? null
    }
}

export default Neo.setupClass(Segmented);
