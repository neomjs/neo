import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import MainStore             from './MainStore.mjs';
import MenuList              from '../../../src/menu/List.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';

/**
 * @summary menu.List rendering a cascade out of a Neo.data.TreeStore.
 *
 * Identical wiring to `examples/menu/list`, with one difference: the store is a TreeStore instead of a
 * menu.Store. The list does not render the tree store itself — each level derives its own flat store of
 * the records at that level, so selection and key navigation stay correct while the tree stays the one
 * shared source of truth.
 *
 * @class Neo.examples.menu.tree.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.menu.tree.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 130,
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
            maxValue : 800,
            minValue : 30,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.height
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 800,
            minValue : 100,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }]
    }

    createExampleComponent() {
        return Neo.create({
            module      : MenuList,
            displayField: 'text',
            store       : MainStore
        })
    }
}

export default Neo.setupClass(MainContainer);
