import CountryModel from './CountryModel.mjs';
import Store        from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.component.coronaGallery.CountryStore
 * @extends Neo.data.Store
 */
class CountryStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.coronaGallery.CountryStore'
         * @protected
         */
        className: 'Neo.examples.component.coronaGallery.CountryStore',
        /**
         * @member {String} keyProperty='country'
         */
        keyProperty: 'country',
        /**
         * @member {Neo.data.Model} model=CountryModel
         */
        model: CountryModel
    }
}

Neo.setupClass(CountryStore);

export default CountryStore;
