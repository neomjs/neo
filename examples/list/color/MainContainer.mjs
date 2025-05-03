import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ColorList             from '../../../src/list/Color.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import MainStore             from './MainStore.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';

/**
 * @class Neo.examples.list.color.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.list.color.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 130,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.disableSelection,
            labelText: 'disableSelection',
            listeners: {change: me.onConfigChange.bind(me, 'disableSelection')}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 300,
            minValue : 30,
            stepSize : 5,
            value    : me.exampleComponent.height,
            style    : {marginTop: '10px'}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 300,
            minValue : 100,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }]
    }

    createExampleComponent() {
        return Neo.create({
            module: ColorList,
            store : MainStore,
            width : 100
        })
    }
}

export default Neo.setupClass(MainContainer);
