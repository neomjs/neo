import Model from './MainModel.mjs';
import Store from '../../src/data/Store.mjs';

const firstNames = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Harper', 'Jordan', 'Morgan', 'Riley'],
    lastNames    = ['Brooks', 'Carter', 'Diaz', 'Ellis', 'Foster', 'Hayes', 'Morgan', 'Reed'],
    countries    = ['Canada', 'France', 'Germany', 'India', 'Japan', 'Australia', 'United Kingdom', 'United States'],
    data         = Array.from({length: 80}, (_, index) => ({
        id        : index + 1,
        customer  : `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length)]}`,
        country   : countries[index % countries.length],
        openOrders: (index * 7) % 17,
        lastOrder : `2025-08-${String(index % 28 + 1).padStart(2, '0')}`,
        active    : index % 3 !== 0
    }));

/**
 * @class Neo.examples.tableFiltering.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.tableFiltering.MainStore',
        keyProperty: 'id',
        model      : Model,
        data
    }
}

export default Neo.setupClass(MainStore);
