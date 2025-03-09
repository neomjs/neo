import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.grid.animatedRowSorting.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className: 'Neo.examples.grid.animatedRowSorting.MainStore',
        model    : Model,

        data: [
            {country : 'DE', firstname: 'Max',     id: 1, lastname : 'Johnson',  progress :  50},
            {country : 'UK', firstname: 'Paul',    id: 2, lastname : 'Walker',   progress :  10},
            {country : 'US', firstname: 'Sam',     id: 3, lastname : 'Anderson', progress :  90},
            {country : 'GR', firstname: 'William', id: 4, lastname : 'Wilson',   progress :  30},
            {country : 'AT', firstname: 'Carol',   id: 5, lastname : 'Jackson',  progress :  70},
            {country : 'NL', firstname: 'Amanda',  id: 6, lastname : 'King',     progress : 100},
            {country : 'FR', firstname: 'Sarah',   id: 7, lastname : 'Scott',    progress :  35}
        ],

        filters: [{
            property: 'firstname',
            operator: 'like',
            value   : null
        }],

        sorters: [{
            property : 'id',
            direction: 'ASC'
        }]
    }
}

export default Neo.setupClass(MainStore);
