import CheckBox              from '../../../src/form/field/CheckBox.mjs';
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
        configItemLabelWidth: 150,
        configItemWidth     : 250,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me                 = this,
            {exampleComponent} = me;

        return [{
            module   : CheckBox,
            checked  : exampleComponent.autoCycle,
            labelText: 'autoCycle',
            listeners: {change: me.onConfigChange.bind(me, 'autoCycle')}
        }, {
            module   : NumberField,
            clearable: false,
            labelText: 'autoCycleInterval',
            listeners: {change: me.onConfigChange.bind(me, 'autoCycleInterval')},
            maxValue : 10000,
            minValue : 0,
            stepSize : 1000,
            style    : {marginTop: '10px'},
            value    : exampleComponent.autoCycleInterval
        }, {
            module   : TextField,
            clearable: false,
            labelText: 'fontFamily',
            listeners: {change: me.onConfigChange.bind(me, 'fontFamily')},
            maxValue : 10000,
            minValue : 0,
            stepSize : 1000,
            style    : {marginTop: '10px'},
            value    : exampleComponent.fontFamily,
            width    : 300
        }]
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
