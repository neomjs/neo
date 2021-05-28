import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Splitter              from '../../../src/component/Splitter.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.component.splitter.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className           : 'Neo.examples.component.splitter.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 110,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }}

    createConfigurationComponents() {
        let me = this;

        return [{
            module    : NumberField,
            clearable : true,
            labelText : 'height',
            listeners : {change: me.onConfigChange.bind(me, 'height')},
            maxValue  : 1000,
            minValue  : 200,
            stepSize  : 5,
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.height
        }, {
            module    : NumberField,
            clearable : true,
            labelText : 'width',
            listeners : {change: me.onConfigChange.bind(me, 'width')},
            maxValue  : 1000,
            minValue  : 200,
            stepSize  : 5,
            value     : me.exampleComponent.width
        }];
    }

    createExampleComponent() {
        return Neo.ntype({
            ntype: 'container',
            height: 600,
            layout: {ntype: 'hbox', align: 'stretch'},
            style : {border: '1px solid var(--panel-border-color)'},
            width : 600,
            items : [{
                ntype: 'component'
            }, {
                module : Splitter
            }, {
                ntype: 'component'
            }]
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
