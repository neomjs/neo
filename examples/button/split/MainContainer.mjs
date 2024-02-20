import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import SelectField           from '../../../src/form/field/Select.mjs';
import SplitButton           from '../../../src/button/Split.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.button.split.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.button.split.MainContainer',
        configItemLabelWidth: 160,
        configItemWidth     : 280,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module    :  NumberField,
            clearable : true,
            labelText : 'height',
            listeners : {change: me.onConfigChange.bind(me, 'height')},
            maxValue  : 300,
            minValue  : 30,
            stepSize  : 5,
            value     : me.exampleComponent.height
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.hideTriggerButton,
            labelText: 'hideTriggerButton',
            listeners: {change: me.onConfigChange.bind(me, 'hideTriggerButton')},
            style    : {marginTop: '10px'}
        }, {
            module    :  TextField, // todo: selectField with options
            labelText : 'iconCls',
            listeners : {change: me.onConfigChange.bind(me, 'iconCls')},
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.iconCls
        }, {
            module    :  TextField, // todo: colorPickerField
            clearable : true,
            labelText : 'iconColor',
            listeners : {change: me.onConfigChange.bind(me, 'iconColor')},
            value     : me.exampleComponent.iconColor
        }, {
            module        : Radio,
            checked       : me.exampleComponent.iconPosition === 'top',
            hideValueLabel: false,
            labelText     : 'iconPosition',
            listeners     : {change: me.onRadioChange.bind(me, 'iconPosition', 'top')},
            name          : 'iconPosition',
            style         : {marginTop: '10px'},
            valueLabelText: 'Top'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.iconPosition === 'right',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'iconPosition', 'right')},
            name          : 'iconPosition',
            valueLabelText: 'Right'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.iconPosition === 'bottom',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'iconPosition', 'bottom')},
            name          : 'iconPosition',
            valueLabelText: 'Bottom'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.iconPosition === 'left',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'iconPosition', 'left')},
            name          : 'iconPosition',
            valueLabelText: 'Left'
        }, {
            module    :  TextField,
            clearable : true,
            labelText : 'text',
            listeners : {change: me.onConfigChange.bind(me, 'text')},
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.text
        }, {
            module        : SelectField,
            forceSelection: true,
            labelText     : 'ui',
            listeners     : {change: me.onConfigChange.bind(me, 'ui')},
            style         : {marginTop: '10px'},
            value         : me.exampleComponent.ui,

            store: {
                data: [
                    {id: 'ghost',     name: 'ghost'},
                    {id: 'primary',   name: 'primary'},
                    {id: 'secondary', name: 'secondary'},
                    {id: 'tertiary',  name: 'tertiary'}
                ]
            }
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'width',
            listeners : {change: me.onConfigChange.bind(me, 'width')},
            maxValue  : 300,
            minValue  : 100,
            stepSize  : 5,
            value     : me.exampleComponent.width
        }];
    }

    createExampleComponent() {
        return Neo.create({
            module : SplitButton,
            iconCls: 'fa fa-home',
            text   : 'Hello World',
            ui     : 'ghost',

            handler: data => {
                console.log('button click =>', data.component.id);
            },

            splitButtonHandler: data => {
                console.log('split button click =>', data.component.id);
            }
        });
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
