import Store from '../../../../src/data/Store.mjs';
import Model from './MainModel.mjs';

/**
 * @class TestApp.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static getConfig() {return {
        className: 'TestApp.MainStore',
        ntype    : 'main-store',

        autoLoad   : true,
        keyProperty: 'abbreviation',
        model      : Model,
        url        : '../../resources/examples/data/us_states.json',

        sorters: [{
            property : 'name',
            direction: 'ASC'
        }]
    }}
}

Neo.applyClassConfig(MainStore);

export {MainStore as default};