import Button                from '../../../src/button/Base.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

        autoMount           : true,
        configItemLabelWidth: 110,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }}

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
            module    :  TextField, // todo: selectField with options
            labelText : 'iconCls',
            listeners : {change: me.onConfigChange.bind(me, 'iconCls')},
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
            iconCls: 'fa fa-home',
            module : Button,
            text   : 'Hello World',

            /*tooltips: [{
                text: 'Hello World Tooltip'
            }],*/

            domListeners: {
                click: {
                    fn: (data) => {
                        let button = Neo.getComponent(data.target.id);
                        console.log('button click =>', button.id);
                    }
                }
            }
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};