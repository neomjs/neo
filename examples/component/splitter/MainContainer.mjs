import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Splitter              from '../../../src/component/Splitter.mjs';

/**
 * @class Neo.examples.component.splitter.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.component.splitter.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 110,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 1000,
            minValue : 200,
            stepSize : 5,
            value    : me.exampleComponent.height
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.direction === 'horizontal',
            labelText: 'horizontal',
            listeners: {change: me.switchDirection.bind(me)},
            style    : {marginTop: '10px'}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 1000,
            minValue : 200,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
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

    /**
     * @param {Object} data
     */
    logInstance(data) {
        console.log(this.exampleComponent.down({module: Splitter}));
    }

    /**
     * @param {Object} data
     */
    switchDirection(data) {
        this.exampleComponent.down({module: Splitter}).direction = data.value ? 'horizontal' : 'vertical';

        this.exampleComponent.layout = {
            ntype: data.value ? 'vbox' : 'hbox',
            align: 'stretch'
        };
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
