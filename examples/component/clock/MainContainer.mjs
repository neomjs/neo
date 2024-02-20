import Clock                 from '../../../src/component/Clock.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import TimeField             from '../../../src/form/field/Time.mjs';

/**
 * @class Neo.examples.component.chip.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.component.chip.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 110,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module    :  NumberField,
            clearable : true,
            labelText : 'fontSize',
            listeners : {change: me.onConfigChange.bind(me, 'fontSize')},
            maxValue  : 30,
            minValue  : 1,
            stepSize  : 1,
            value     : me.exampleComponent.fontSize
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'size',
            listeners : {change: me.onConfigChange.bind(me, 'size')},
            maxValue  : 600,
            minValue  : 20,
            stepSize  : 1,
            value     : me.exampleComponent.size
        }, {
            module   : TimeField,
            labelText: 'time',
            listeners: {change: me.onConfigChange.bind(me, 'time')},
            maxValue : '12:00',
            minValue : '00:00',
            value    : me.exampleComponent.time
        }];
    }

    createExampleComponent() {
        return Neo.create({
            module: Clock,
            time  : '10:20'
        });
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
