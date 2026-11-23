import DisplayField   from '../../../../src/form/field/Display.mjs';
import StatesViewport from '../StatesViewport.mjs';

/**
 * @class Neo.examples.form.field.display.MainContainer
 * @extends Neo.examples.form.field.StatesViewport
 */
class MainContainer extends StatesViewport {
    static config = {
        className    : 'Neo.examples.form.field.display.MainContainer',
        autoMount    : true,
        componentName: 'Display field',
        layout       : {ntype: 'hbox', align: 'stretch'},

        field: {
            module         : DisplayField,
            labelText      : 'Order number',
            placeholderText: 'Not assigned yet',
            labelWidth     : 110,
            width          : 300
        },
        // A display field shows a value nobody edits: it is read-only by nature and never invalid
        states: {
            filled: {value: 'NEO-2026-0042'},
            empty : {}
        }
    }

    /**
     * A display field is never cleared, required or typed into
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        return super.createConfigurationComponents()
            .filter(control => !['clearable', 'placeholderText', 'required'].includes(control.labelText))
    }
}

export default Neo.setupClass(MainContainer);
