import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import StatusBadge           from '../../../src/component/StatusBadge.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.component.statusbadge.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.component.statusbadge.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 110,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.closable,
            labelText: 'closable',
            listeners: {change: me.onConfigChange.bind(me, 'closable')}
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'height',
            listeners : {change: me.onConfigChange.bind(me, 'height')},
            maxValue  : 100,
            minValue  : 20,
            stepSize  : 2,
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.height
        }, {
            module        : Radio,
            checked       : me.exampleComponent.state === 'error',
            hideValueLabel: false,
            labelText     : 'state',
            listeners     : {change: me.onRadioChange.bind(me, 'state', 'error')},
            name          : 'state',
            style         : {marginTop: '10px'},
            valueLabelText: 'error'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.badgePosition === 'success',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'state', 'success')},
            name          : 'state',
            valueLabelText: 'success'
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'width',
            listeners : {change: me.onConfigChange.bind(me, 'width')},
            maxValue  : 300,
            minValue  : 100,
            stepSize  : 5,
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.width
        }]
    }

    createExampleComponent() {
        return Neo.create({
            module: StatusBadge,
            height: 30,
            state : 'error'
        })
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
