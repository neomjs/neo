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
        }, {
            module: TextField,
            labelText: 'label Alert',
            listeners: { change: me.onConfigChange.bind(me, 'labelAlert') },
            style: { marginTop: '20px' },
            value: me.exampleComponent.labelAlert
        }, {
            module: TextField,
            labelText: 'icon Alert',
            listeners: { change: me.onConfigChange.bind(me, 'iconAlert') },
            value: me.exampleComponent.iconAlert
        }, {
            module: TextField,
            labelText: 'side-icon Alert',
            listeners: { change: me.onConfigChange.bind(me, 'sideIconAlert') },
            value: me.exampleComponent.sideIconAlert
        }, {
            module: TextField,
            labelText: 'label Error',
            listeners: { change: me.onConfigChange.bind(me, 'labelError') },
            style: { marginTop: '10px' },
            value: me.exampleComponent.labelError
        }, {
            module: TextField,
            labelText: 'icon Error',
            listeners: { change: me.onConfigChange.bind(me, 'iconError') },
            value: me.exampleComponent.iconError
        }, {
            module: TextField,
            labelText: 'side-icon Error',
            listeners: { change: me.onConfigChange.bind(me, 'sideIconError') },
            value: me.exampleComponent.sideIconError
        },{
            module: TextField,
            labelText: 'label Info',
            listeners: { change: me.onConfigChange.bind(me, 'labelInfo') },
            style: { marginTop: '10px' },
            value: me.exampleComponent.labelInfo
        }, {
            module: TextField,
            labelText: 'icon Info',
            listeners: { change: me.onConfigChange.bind(me, 'iconInfo') },
            value: me.exampleComponent.iconInfo
        }, {
            module: TextField,
            labelText: 'side-icon Info',
            listeners: { change: me.onConfigChange.bind(me, 'sideIconInfo') },
            value: me.exampleComponent.sideIconInfo 
        }, {
            module: TextField,
            labelText: 'label Neutral',
            listeners: { change: me.onConfigChange.bind(me, 'labelNeutral') },
            style: { marginTop: '10px' },
            value: me.exampleComponent.labelNeutral
        }, {
            module: TextField,
            labelText: 'icon Neutral',
            listeners: { change: me.onConfigChange.bind(me, 'iconNeutral') },
            value: me.exampleComponent.iconNeutral
        }, {
            module: TextField,
            labelText: 'side-icon Neutral',
            listeners: { change: me.onConfigChange.bind(me, 'sideIconNeutral') },
            value: me.exampleComponent.sideIconNeutral
        }, {
            module: TextField,
            labelText: 'label Success',
            listeners: { change: me.onConfigChange.bind(me, 'labelSuccess') },
            style: { marginTop: '10px' },
            value: me.exampleComponent.labelSuccess
        }, {
            module: TextField,
            labelText: 'icon Success',
            listeners: { change: me.onConfigChange.bind(me, 'iconSuccess') },
            value: me.exampleComponent.iconSuccess
        }, {
            module: TextField,
            labelText: 'side-icon Success',
            listeners: { change: me.onConfigChange.bind(me, 'sideIconSuccess') },
            value: me.exampleComponent.sideIconSuccess
        }, {
            module: CheckBox,
            checked: me.exampleComponent.deactivateStateIcons,
            labelText: 'deactivate State Icons',
            style: { marginTop: '20px' },
            listeners: { change: me.onConfigChange.bind(me, 'deactivateStateIcons') },
        }, {
            module: CheckBox,
            checked: me.exampleComponent.deactivateSideIcons,
            labelText: 'deactivate Side Icons',
            listeners: { change: me.onConfigChange.bind(me, 'deactivateSideIcons') },
        }, {
            module: Radio,
            checked: me.exampleComponent.state === 'alert',
            hideValueLabel: false,
            labelText: 'state',
            listeners: { change: me.onRadioChange.bind(me, 'state', 'alert') },
            name: 'state',
            style: { marginTop: '20px' },
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
        }]
    }

    createExampleComponent() {
        return Neo.create({
            module: StatusBadge,
            height: 30,
            state: 'info'
        })
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
