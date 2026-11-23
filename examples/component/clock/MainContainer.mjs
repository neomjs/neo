import Clock                 from '../../../src/component/Clock.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import TimeField             from '../../../src/form/field/Time.mjs';

/**
 * @class Neo.examples.component.clock.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.component.clock.MainContainer',
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
        }]
    }

    /** @summary Returns the `Neo.component.Clock` config for the workbench stage. @returns {Object} */
    createExampleComponent() {
        return {
            module: Clock,
            time  : '10:20'
        }
    }
}

export default Neo.setupClass(MainContainer);
