import Button                  from '../../../src/button/Base.mjs';
import ConfigurationViewport   from '../../ConfigurationViewport.mjs';
import MainContainerController from './MainContainerController.mjs';
import NumberField             from '../../../src/form/field/Number.mjs';
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

        return [{
            module    : TextField,
            clearable : true,
            labelText : 'title',
            listeners : {change: me.controller.onConfigChange.bind(me.controller, 'title')},
            style     : {marginTop: '10px'},
            value     : 'example dialog'
        }, {
            module    : NumberField,
            clearable : true,
            labelText : 'height',
            listeners : {change: me.controller.onConfigChange.bind(me.controller, 'height')},
            maxValue  : 1000,
            minValue  : 100,
            stepSize  : 10,
            style     : {marginTop: '10px'},
            value     : 300
        }, {
            module    : NumberField,
            clearable : true,
            labelText : 'width',
            listeners : {change: me.controller.onConfigChange.bind(me.controller, 'width')},
            maxValue  : 2000,
            minValue  : 100,
            stepSize  : 10,
            style     : {marginTop: '10px'},
            value     : 500
        }];
    }

    createExampleComponent() {
        let controller = this.getController();
        return Neo.create({
            module   : Button,
            height   : 50,
            text     : 'show Dialog',
            ui       : 'primary',
            width    : 150,
            handler  : controller.onButtonClick.bind(controller)
        });
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
