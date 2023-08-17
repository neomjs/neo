import CheckBox from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField from '../../../src/form/field/Number.mjs';
import Radio from '../../../src/form/field/Radio.mjs';
import StatusBadge from '../../../src/component/StatusBadge.mjs';
import TextField from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.component.statusbadge.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className: 'Neo.examples.component.statusbadge.MainContainer',
        autoMount: true,
        configItemLabelWidth: 110,
        configItemWidth: 230,
        layout: { ntype: 'hbox', align: 'stretch' }
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module: CheckBox,
            checked: me.exampleComponent.closable,
            labelText: 'closable',
            listeners: { change: me.onConfigChange.bind(me, 'closable') }
        }, {
            module: NumberField,
            clearable: true,
            labelText: 'height',
            listeners: { change: me.onConfigChange.bind(me, 'height') },
            maxValue: 100,
            minValue: 20,
            stepSize: 2,
            style: { marginTop: '10px' },
            value: me.exampleComponent.height
        },  {
            module: TextField,
            labelText: 'label Alert',
            listeners: { change: me.onConfigChange.bind(me, 'labelAlert') },
            style: { marginTop: '10px' },
            value: me.exampleComponent.labelAlert
        },{
            module: TextField,
            labelText: 'label Error',
            listeners: { change: me.onConfigChange.bind(me, 'labelError') },
            value: me.exampleComponent.labelError
        },{
            module: TextField,
            labelText: 'label Info',
            listeners: { change: me.onConfigChange.bind(me, 'labelInfo') },
            value: me.exampleComponent.labelInfo
        },{
            module: TextField,
            labelText: 'label Neutral',
            listeners: { change: me.onConfigChange.bind(me, 'labelNeutral') },
            value: me.exampleComponent.labelNeutral
        },{
            module: TextField,
            labelText: 'label Success',
            listeners: { change: me.onConfigChange.bind(me, 'labelSuccess') },
            value: me.exampleComponent.labelSuccess
        },{
            module: Radio,
            checked: me.exampleComponent.state === 'alert',
            hideValueLabel: false,
            labelText: 'state',
            listeners: { change: me.onRadioChange.bind(me, 'state', 'alert') },
            name: 'state',
            style: { marginTop: '10px' },
            valueLabelText: 'alert'
        }, {
            module: Radio,
            checked: me.exampleComponent.state === 'error',
            hideValueLabel: false,
            labelText: '',
            listeners: { change: me.onRadioChange.bind(me, 'state', 'error') },
            name: 'state',
            valueLabelText: 'error'
        }, {
            module: Radio,
            checked: me.exampleComponent.state === 'info',
            hideValueLabel: false,
            labelText: '',
            listeners: { change: me.onRadioChange.bind(me, 'state', 'info') },
            name: 'state',
            valueLabelText: 'info'
        }, {
            module: Radio,
            checked: me.exampleComponent.state === 'neutral',
            hideValueLabel: false,
            labelText: '',
            listeners: { change: me.onRadioChange.bind(me, 'state', 'neutral') },
            name: 'state',
            valueLabelText: 'neutral'
        }, {
            module: Radio,
            checked: me.exampleComponent.state === 'success',
            hideValueLabel: false,
            labelText: '',
            listeners: { change: me.onRadioChange.bind(me, 'state', 'success') },
            name: 'state',
            valueLabelText: 'success'
        }, {
            module: NumberField,
            clearable: true,
            labelText: 'width',
            listeners: { change: me.onConfigChange.bind(me, 'width') },
            maxValue: 300,
            minValue: 100,
            stepSize: 5,
            style: { marginTop: '10px' },
            value: me.exampleComponent.width
        }]
    }

    createExampleComponent() {
        return Neo.create({
            module: StatusBadge,
            height: 30,
            state: 'error'
        })
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
