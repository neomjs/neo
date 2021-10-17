import MainModel from './MainModel.mjs';
import Store     from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.list.animate.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static getConfig() {return {
        className  : 'Neo.examples.list.animate.MainStore',
        autoLoad   : true,
        keyProperty: 'id',
        model      : MainModel,
        url        : '../../resources/examples/data/circleContacts.json',

        filters: [{
            disabled : true,
            property : 'isOnline',
            value    : true
        }],

        sorters: [{
            property : 'firstname',
            direction: 'ASC'
        }]
    }}
}

Neo.applyClassConfig(MainStore);

export {MainStore as default};
