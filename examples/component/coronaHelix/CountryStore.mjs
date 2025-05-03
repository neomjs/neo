import CountryModel from './CountryModel.mjs';
import Store        from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.component.coronaHelix.CountryStore
 * @extends Neo.data.Store
 */
class CountryStore extends Store {
    static config = {
        className  : 'Neo.examples.component.coronaHelix.CountryStore',
        keyProperty: 'country',
        model      : CountryModel
    }
}

export default Neo.setupClass(CountryStore);
