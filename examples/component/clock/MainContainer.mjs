import Clock                 from '../../../src/component/Clock.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';

/**
 * @class Neo.examples.component.chip.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className           : 'Neo.examples.component.chip.MainContainer',
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
            labelText : 'size',
            listeners : {change: me.onConfigChange.bind(me, 'size')},
            maxValue  : 300,
            minValue  : 100,
            stepSize  : 5,
            value     : me.exampleComponent.width
        }];
    }

    createExampleComponent() {
        return Neo.create({
            module: Clock,
            size  : 100
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
