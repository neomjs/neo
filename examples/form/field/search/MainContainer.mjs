import SearchField    from '../../../../src/form/field/Search.mjs';
import StatesViewport from '../StatesViewport.mjs';

/**
 * @class Neo.examples.form.field.search.MainContainer
 * @extends Neo.examples.form.field.StatesViewport
 */
class MainContainer extends StatesViewport {
    static config = {
        className    : 'Neo.examples.form.field.search.MainContainer',
        autoMount    : true,
        componentName: 'Search field',
        layout       : {ntype: 'hbox', align: 'stretch'},

        field: {
            module         : SearchField,
            labelText      : 'Search',
            labelWidth     : 70,
            placeholderText: 'Search examples',
            width          : 300
        },
        // A search accepts any text: there is nothing to validate
        states: {
            filled  : {value: 'grid'},
            empty   : {},
            disabled: {},
            readOnly: {}
        }
    }
}

export default Neo.setupClass(MainContainer);
