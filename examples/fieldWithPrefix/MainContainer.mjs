import ComboBox              from '../../src/form/field/ComboBox.mjs';
import ConfigurationViewport from '../ConfigurationViewport.mjs';
import PrefixPlugin          from '../../src/plugin/PrefixField.mjs';
import TextField             from '../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.fieldWithPrefix.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.fieldWithPrefix.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 100,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'},
        cls                 : ['examples-container-accordion']
    }

    onPluginConfigChange(config, opts) {
        const textfield = this.exampleComponent.items[0],
              plugin    = textfield.getPlugin('prefixfield');

        if (config === 'accept') {
            plugin.accept = opts.record.value;
        } else {
            plugin[config] = opts.value;
            textfield.value = '';
        }
    }

    createConfigurationComponents() {
        let me        = this,
            textfield = me.exampleComponent.items[0],
            plugin    = textfield.plugins[0];

        return [{
            module   : TextField,
            clearable: true,
            labelText: 'pattern',
            listeners: {change: me.onPluginConfigChange.bind(me, 'pattern')},
            value    : plugin.pattern,
            style    : {marginTop: '10px'}
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'slots',
            listeners: {change: me.onPluginConfigChange.bind(me, 'slots')},
            value    : '_',
            style    : {marginTop: '10px'}
        }, {
            module: ComboBox,
            store : {
                model: {fields: [{name: 'id'}, {name: 'name'}, {name: 'value'}]},
                data : [
                    {id: '0', name: 'empty=/\\d/', value: null},
                    {id: '1', name: '[0-9]', value: '[0-9]'},
                    {id: '2', name: '[A-H]', value: '[A-H]'},
                    {id: '3', name: '/\\w/', value: /\w/},
                    {id: '4', name: '/\\d/', value: /\d/},
                    {id: '5', name: '[0-9a-f]', value: '[0-9a-f]'}
                ]
            },

            value       : '4',
            displayField: 'name',
            valueField  : 'value',

            clearable: true,
            labelText: 'accept',
            listeners: {change: me.onPluginConfigChange.bind(me, 'accept')},
            style    : {marginTop: '10px'}
        }];
    }

    /**
     * @returns {*}
     */
    createExampleComponent() {
        return Neo.ntype({
            ntype : 'container',
            width : 350,
            cls   : ['example-fieldWithPrefix'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module   : TextField,
                labelText: 'Phone Number',
                plugins  : [
                    {
                        module : PrefixPlugin,
                        pattern: '+1 (___) ___-___-____',
                        slots  : '_'
                    }
                ]
            }, {
                module   : TextField,
                labelText: '[0-9] Date',
                plugins  : [
                    {
                        module : PrefixPlugin,
                        pattern: 'dd/mm/yyyy hh:mm',
                        slots  : 'dmyh'
                    }
                ]
            }, {
                module   : TextField,
                labelText: '[A-H] MAC Adress',
                plugins  : [
                    {
                        module : PrefixPlugin,
                        pattern: 'XX:XX:XX:XX:XX:XX',
                        slots  : 'X',
                        accept : '[A-H]'
                    }
                ]
            }, {
                module   : TextField,
                labelText: '/\\w/ Alphanumeric',
                plugins  : [
                    {
                        module : PrefixPlugin,
                        pattern: '__-__-__-____',
                        slots  : '_',
                        accept : /\w/
                    }
                ]
            }, {
                module   : TextField,
                labelText: '/\\d/ Credit Card',
                plugins  : [
                    {
                        module : PrefixPlugin,
                        pattern: '.... .... .... ....',
                        slots  : '.',
                        accept : /\d/
                    }
                ]
            }]
        })
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
