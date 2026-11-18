import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Container             from '../../../src/container/Base.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @summary A field workbench whose stage shows the field in each state that applies to its type.
 *
 * An entry declares its field once (`field`) and the states that apply (`states`). The live field, which the
 * inspector drives, is the filled state and stays the stage's first item. Below it, captioned, the same field is
 * rendered once per further state: empty with its placeholder, invalid with its own message, disabled and read-only.
 * @class Neo.examples.form.field.StatesViewport
 * @extends Neo.examples.ConfigurationViewport
 * @abstract
 */
class StatesViewport extends ConfigurationViewport {
    /**
     * The states below the live field in stage order, each with its caption and the configs it starts from.
     * Empty and invalid start without a value; disabled and read-only start from the filled state.
     * A type with states of its own lists them in its own `sheet`.
     * @member {Object[]} sheet
     * @static
     */
    static sheet = [
        {key: 'empty',    caption: 'Empty',     forced: {value: null}},
        {key: 'invalid',  caption: 'Invalid',   forced: {value: null}},
        {key: 'disabled', caption: 'Disabled',  fromFilled: true, forced: {disabled: true}},
        {key: 'readOnly', caption: 'Read-only', fromFilled: true, forced: {readOnly: true}}
    ]

    static config = {
        /**
         * @member {String} className='Neo.examples.form.field.StatesViewport'
         * @protected
         */
        className: 'Neo.examples.form.field.StatesViewport',
        /**
         * @member {String[]} baseCls=['neo-field-states-viewport','neo-examples-configuration-viewport','neo-viewport','neo-workbench']
         */
        baseCls: ['neo-field-states-viewport', 'neo-examples-configuration-viewport', 'neo-viewport', 'neo-workbench'],
        /**
         * @member {Number} configItemLabelWidth=160
         */
        configItemLabelWidth: 160,
        /**
         * The config every field on the stage starts from. A value belongs to `states.filled`, not here.
         * @member {Object|null} field=null
         */
        field: null,
        /**
         * The states that apply to the field's type, each a config merged over `field`. `filled` configures the
         * live field, and `disabled` and `readOnly` start from it. `invalid` is validated once created, so the field
         * shows its own message. A state the type lacks is left out.
         * @member {Object} states={filled: {}, empty: {}, disabled: {}, readOnly: {}}
         */
        states: {filled: {}, empty: {}, disabled: {}, readOnly: {}}
    }

    /**
     * The controls every text-based field shares. An entry for such a type adds its own after them.
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me    = this,
            field = me.exampleComponent;

        return [{
            module   : TextField,
            labelText: 'labelText',
            listeners: {change: me.onConfigChange.bind(me, 'labelText')},
            value    : field.labelText
        }, ...['left', 'top', 'inline'].map((position, index) => ({
            module        : Radio,
            checked       : field.labelPosition === position,
            hideValueLabel: false,
            labelText     : index === 0 ? 'labelPosition' : '',
            listeners     : {change: me.onRadioChange.bind(me, 'labelPosition', position)},
            name          : 'labelPosition',
            valueLabel    : position
        })), {
            module   : TextField,
            clearable: true,
            labelText: 'placeholderText',
            listeners: {change: me.onConfigChange.bind(me, 'placeholderText')},
            value    : field.placeholderText
        }, {
            module   : NumberField,
            labelText: 'labelWidth',
            listeners: {change: me.onConfigChange.bind(me, 'labelWidth')},
            maxValue : 200,
            minValue : 50,
            stepSize : 5,
            value    : field.labelWidth
        }, {
            module   : NumberField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 500,
            minValue : 150,
            stepSize : 10,
            value    : field.width
        }, ...['clearable', 'hideLabel', 'required'].map(config => ({
            module   : CheckBox,
            checked  : field[config],
            labelText: config,
            listeners: {change: me.onConfigChange.bind(me, config)}
        }))]
    }

    /**
     * The live field: `field` in its filled state
     * @returns {Object}
     */
    createExampleComponent() {
        let {field, states} = this;

        // Every field on the stage gets its own copy: nested configs (a store, a document) are never shared
        return Neo.clone({...field, ...states.filled}, true)
    }

    /**
     * Renders the field once per further state that applies to its type, each under its caption
     * @returns {Object[]}
     */
    createStageItems() {
        let me              = this,
            {field, states} = me,
            items           = [];

        me.constructor.sheet.forEach(({caption, forced, fromFilled, key}) => {
            let state = states[key];

            state && items.push({
                module: Container,
                cls   : ['neo-field-state'],
                layout: 'base',
                items : [{
                    ntype: 'label',
                    cls  : ['neo-field-state-caption'],
                    text : caption
                }, Neo.clone({
                    ...field,
                    ...(fromFilled ? states.filled : null),
                    ...forced,
                    ...state,
                    // A radio or check box group is keyed by its name: each state stands on its own
                    ...(field.name ? {name: `${field.name}-${key}`} : null),
                    reference: `state-${key}`
                }, true)]
            })
        });

        return items.length ? [{module: Container, cls: ['neo-field-states'], items, layout: 'base'}] : []
    }

    /**
     * Shows the invalid state's own message: `validate(false)` renders the error before the field mounts
     */
    onConstructed() {
        super.onConstructed();

        this.down({reference: 'state-invalid'})?.validate(false)
    }
}

export default Neo.setupClass(StatesViewport);
