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
        }, {
            property : 'name',
            value    : null,

            filterBy: opts => {
                if (opts.value) {

                    console.log(opts);
                    return false;
                }

                return false;
            }
        }],

        sorters: [{
            property : 'firstname',
            direction: 'ASC'
        }]
    }}
}

Neo.applyClassConfig(MainStore);

export {MainStore as default};
