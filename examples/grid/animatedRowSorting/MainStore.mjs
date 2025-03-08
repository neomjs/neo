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

        data: [{
            country : 'DE',
            firstname: 'Max',
            id       : 1,
            lastname : 'Johnson'
        }, {
            country : 'UK',
            firstname: 'Paul',
            id       : 2,
            lastname : 'Walker'
        }, {
            country : 'US',
            firstname: 'Sam',
            id       : 3,
            lastname : 'Anderson'
        }, {
            country : 'GR',
            firstname: 'William',
            id       : 4,
            lastname : 'Wilson'
        }, {
            country : 'AT',
            firstname: 'Carol',
            id       : 5,
            lastname : 'Jackson'
        }, {
            country : 'NL',
            firstname: 'Amanda',
            id       : 6,
            lastname : 'King'
        }, {
            country : 'FR',
            firstname: 'Sarah',
            id       : 7,
            lastname : 'Scott'
        }]
    }
}

export default Neo.setupClass(MainStore);
