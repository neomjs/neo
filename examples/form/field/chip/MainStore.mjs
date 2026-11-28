import Store from '../../../../src/data/Store.mjs';
import Model from './MainModel.mjs';

const statesPath = 'resources/examples/data/us_states.json';

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
        url        : Neo.config.url?.base
            ? new URL(Neo.config.basePath + statesPath, Neo.config.url.base).href
            : '../../' + statesPath,

        sorters: [{
            property : 'name',
            direction: 'ASC'
        }]
    }
}

export default Neo.setupClass(MainStore);
