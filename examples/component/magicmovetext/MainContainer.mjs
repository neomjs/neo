import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import MagicMoveText         from '../../../src/component/MagicMoveText.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.component.magicmovetext.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.component.magicmovetext.MainContainer',
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
            maxValue : 100,
            minValue : 20,
            stepSize : 2,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.height
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'labelText',
            listeners: {change: me.onConfigChange.bind(me, 'labelText')},
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.labelText
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 300,
            minValue : 100,
            stepSize : 5,
            value    : me.exampleComponent.width
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'value',
            listeners: {change: me.onConfigChange.bind(me, 'value')},
            maxValue : 100,
            minValue : 0,
            value    : me.exampleComponent.value
        }];
    }

    createExampleComponent() {
        return {
            module: MagicMoveText,

            cycleTexts: [
                'Magic Move',
                'Move characters like magic',
                'Animate between strings',
                'Just like that',
                'Simple to use',
                'Would you use it?'
            ]
        }
    }
}

export default Neo.setupClass(MainContainer);
