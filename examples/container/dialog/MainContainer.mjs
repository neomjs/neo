import Button                  from '../../../src/button/Base.mjs';
import CheckBox                from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport   from '../../ConfigurationViewport.mjs';
import MainContainerController from './MainContainerController.mjs';
import NumberField             from '../../../src/form/field/Number.mjs';
import Radio                   from '../../../src/form/field/Radio.mjs';
import SelectField             from '../../../src/form/field/Select.mjs';
import TextField               from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.container.dialog.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.container.dialog.MainContainer',
        configItemLabelWidth: 160,
        configItemWidth     : 280,
        controller          : MainContainerController,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [ {
            module    : NumberField,
            clearable : true,
            labelText : 'height',
            listeners : {change: me.onConfigChange.bind(me, 'height')},
            maxValue  : 300,
            minValue  : 30,
            stepSize  : 5,
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.height
        }, {
            module    : TextField, // todo: selectField with options
            labelText : 'iconCls',
            listeners : {change: me.onConfigChange.bind(me, 'iconCls')},
            value     : me.exampleComponent.iconCls
        }, {
            module    : TextField, // todo: colorPickerField
            clearable : true,
            labelText : 'iconColor',
            listeners : {change: me.onConfigChange.bind(me, 'iconColor')},
            value     : me.exampleComponent.iconColor
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
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.width
        }];
    }

    createExampleComponent() {
        let controller = this.getController();
        return Neo.create({
            module   : Button,
            badgeText: 'Badge',
            height   : 50,
            iconCls  : 'fa fa-home',
            text     : 'Hello World',
            ui       : 'primary',
            width    : 150,
            handler  : controller.onButtonClick.bind(controller)
        });
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
