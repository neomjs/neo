import CheckBox              from '../../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import FruitSelect           from './FruitSelect.mjs';
import TextField             from '../../../../src/form/field/Text.mjs';

/**
 * @summary A native Select with rich options and live presentation/validation controls.
 * @class Neo.examples.form.field.select.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.form.field.select.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 160,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * @summary Exposes native enhancement, required state and label without replacing the field.
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        const me = this;
        return [{
            module   : CheckBox, checked: true, labelText: 'customizable',
            listeners: {change: me.onConfigChange.bind(me, 'customizable')}
        }, {
            module   : CheckBox, checked: false, labelText: 'required',
            listeners: {change: me.onConfigChange.bind(me, 'required')}
        }, {
            module   : CheckBox, checked: false, labelText: 'disabled',
            listeners: {change: me.onConfigChange.bind(me, 'disabled')}
        }, {
            module   : TextField, labelText: 'labelText', value: 'Fruit',
            listeners: {change: me.onConfigChange.bind(me, 'labelText')}
        }]
    }

    /**
     * @summary Creates the example field; native changes retain typed scalar values.
     * @returns {Neo.examples.form.field.select.FruitSelect}
     */
    createExampleComponent() {
        return Neo.create(FruitSelect, {labelText: 'Fruit', name: 'fruit', width: 300})
    }
}

export default Neo.setupClass(MainContainer);
