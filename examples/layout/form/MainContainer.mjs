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
                    fn   : function (data) {
                        const comp = this.exampleComponent;

                        comp.layout.gap = data.value;
                        comp.down('fieldset').layout.gap = data.value;
                    },
                    scope: this
                }
            },
            reference: 'gap-field',
            value    : '0 .5rem'
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
                labelText: 'This is a wide Label inside Form'
            }, {
                labelText: 'Small Label'
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
                    minLength: 3,
                    value    : 'Layout Demo'
                },
                items       : [{
                    labelText: 'I am inside a fieldset'
                }, {
                    labelText: 'Fieldset with layout-form'
                }]
            }]
        })
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
