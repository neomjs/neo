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
                let record = opts.item,
                    value  = opts.value?.toLowerCase();

                if (value) {
                    return !(
                        record.firstname.toLowerCase().includes(value) ||
                        record.lastname .toLowerCase().includes(value)
                    );
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

export default MainStore;
