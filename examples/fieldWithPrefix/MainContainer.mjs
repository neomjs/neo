import ComboBox              from '../../src/form/field/ComboBox.mjs';
import ConfigurationViewport from '../ConfigurationViewport.mjs';
import PrefixPlugin          from '../../src/plugin/PrefixField.mjs';
import TextField             from '../../src/form/field/Text.mjs';

/**
 * @summary Interactive workbench example for `Neo.plugin.PrefixField` across phone, date, hexadecimal MAC, alphanumeric, and card masks.
 * @class Neo.examples.fieldWithPrefix.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.fieldWithPrefix.MainContainer',
        autoMount           : true,
        componentName       : 'Input masks',
        description         : 'Type into a field: the mask fills its slots as you go and refuses characters it does not accept.',
        configItemLabelWidth: 100,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'},
        cls                 : ['examples-container-accordion']
    }

    /**
     * @summary Syncs inspector `pattern`, `slots`, and `accept` changes onto the first masked field's plugin.
     * @param {String} config
     * @param {Object} opts
     * @returns {Promise<void>}
     */
    async onPluginConfigChange(config, opts) {
        const textfield = this.exampleComponent.items[0],
              plugin    = textfield.getPlugin('prefixfield');

        if (config === 'accept') {
            plugin.accept = opts.value?.value ?? null
        } else {
            textfield.reset();
            await textfield.promiseUpdate();
            plugin[config] = opts.value
        }
    }

    /**
     * @summary Clears all five masked fields on Main before restoring inspector controls to their initial state.
     * @returns {Promise<void>}
     */
    async onReset() {
        const {items} = this.exampleComponent;

        items.forEach(field => {
            field.reset()
        });

        await Promise.all(items.map(field => field.promiseUpdate()));
        super.onReset()
    }

    /**
     * @summary Builds inspector controls for live mask `pattern`, `slots`, and `accept` configuration.
     * @returns {Object[]}
     */
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
                    {id: '0', name: 'empty=/\\d/',  value: null},
                    {id: '1', name: '[0-9]',        value: '[0-9]'},
                    {id: '2', name: '[A-H]',        value: '[A-H]'},
                    {id: '3', name: '/\\w/',        value: /\w/},
                    {id: '4', name: '/\\d/',        value: /\d/},
                    {id: '5', name: '[0-9A-Fa-f]',  value: '[0-9A-Fa-f]'}
                ]
            },

            value       : '4',
            displayField: 'name',
            valueField  : 'value',

            clearable: true,
            labelText: 'accept',
            listeners: {change: me.onPluginConfigChange.bind(me, 'accept')},
            style    : {marginTop: '10px'}
        }]
    }

    /**
     * @summary Creates the responsive five-field input-mask stack capped at `350px` on desktop.
     * @returns {Neo.container.Base}
     */
    createExampleComponent() {
        return Neo.ntype({
            ntype       : 'container',
            cls         : ['example-fieldWithPrefix'],
            itemDefaults: {flex: 'none'},
            layout      : {ntype: 'vbox', align: 'stretch'},
            maxWidth    : 350,
            style       : {flex: 'none'},
            width       : '100%',
            items       : [{
                module   : TextField,
                labelText: 'Phone Number',
                plugins  : [
                    {
                        module : PrefixPlugin,
                        pattern: '+1 (___) ___-____',
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
                labelText: '[0-9A-Fa-f] MAC',
                plugins  : [
                    {
                        module : PrefixPlugin,
                        pattern: 'XX:XX:XX:XX:XX:XX',
                        slots  : 'X',
                        accept : '[0-9A-Fa-f]'
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

export default Neo.setupClass(MainContainer);
