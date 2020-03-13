import CountryModel from './CountryModel.mjs';
import Store        from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.component.coronaGallery.CountryStore
 * @extends Neo.data.Store
 */
class CountryStore extends Store {
    static getConfig() {return {
        className: 'Neo.examples.component.coronaGallery.CountryStore',

        keyProperty: 'country',
        model      : CountryModel
    }}
}

Neo.applyClassConfig(CountryStore);

export {CountryStore as default};