import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Form                  from '../../../src/form/Container.mjs';
import Fieldset              from '../../../src/form/Fieldset.mjs';
import TextField             from '../../../src/form/field/Text.mjs';
import FormLayout            from '../../../src/layout/Form.mjs';

/**
 * @class Neo.examples.layout.form.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.layout.form.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 160,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            ntype: 'component',
            html : 'On the left you see' +
                '<ul>Form > layout-form' +
                '<li>textfield' +
                '<li>textfield' +
                '<li>Fieldset inside the form with another > layout-form' +
                '<ul>' +
                '<li>textfield' +
                '<li>textfield' +
                '</ul></ul>'
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'gap (row column)',
            listeners: {
                change: {
                    fn: function (data) {
                        const comp = this.exampleComponent;

                        comp.layout.gap = data.value;
                        comp.down('fieldset').layout.gap = data.value;
                    },
                    scope: this
                }
            },
            value    : '0 .5rem'
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'Textfield 01 Label',
            listeners: {change: me.updateLabelFromTextField.bind(me, 1)},
            value    : 'This is a wide label inside Form'
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'Textfield 02 Label',
            listeners: {change: me.updateLabelFromTextField.bind(me, 2)},
            value    : 'Small label'
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'Textfield 03 Label',
            listeners: {change: me.updateLabelFromTextField.bind(me, 3)},
            value    : 'I am inside a fieldset'
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'Textfield 04 Label',
            listeners: {change: me.updateLabelFromTextField.bind(me, 4)},
            value    : 'Fieldset with layout-form'
        }]
    }

    createExampleComponent() {
        return Neo.create(Form, {
            layout      : {
                ntype: 'layout-form',
                gap  : '0 .5rem'
            },
            itemDefaults: {
                ntype    : 'textfield',
                clearable: true,
                value    : 'Layout Demo'
            },
            items       : [{
                labelText: 'This is a wide Label inside Form',
                name     : 1
            }, {
                labelText: 'Small Label',
                name     : 2
            }, {
                module      : Fieldset,
                title       : 'Fieldset with Layout',
                layout      : {
                    ntype: 'layout-form',
                    gap  : '0 .5rem'
                },
                itemDefaults: {
                    ntype    : 'textfield',
                    clearable: true,
                    value    : 'Layout Demo'
                },
                items       : [{
                    labelText: 'I am inside a fieldset',
                    name     : 3
                }, {
                    labelText: 'Fieldset with layout-form',
                    name     : 4
                }]
            }]
        })
    }

    /**
     * Update the textfield labelText, based on index
     * @param {Number} index
     * @param {Object} data
     */
    updateLabelFromTextField(index, data) {
        const comp      = this.exampleComponent,
              textfield = comp.down({ntype: 'textfield', name: index});

        textfield.labelText = data.value
    }
}

export default Neo.setupClass(MainContainer);
