import Store from '../../../../src/data/Store.mjs';
import Model from './MainModel.mjs';

/**
 * @class Neo.examples.form.field.chip.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.form.field.chip.MainStore',
        autoLoad   : true,
        keyProperty: 'abbreviation',
        model      : Model,
        url        : '../../resources/examples/data/us_states.json',

        sorters: [{
            property : 'name',
            direction: 'ASC'
        }]
    }
}

export default Neo.setupClass(MainStore);
