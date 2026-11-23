import CountryModel from './CountryModel.mjs';
import Store        from '../../../src/data/Store.mjs';

/**
 * @summary The 217 economies the country grid reads, the World Bank's figures, largest population first.
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
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {String} keyProperty='country'
         */
        keyProperty: 'country',
        /**
         * @member {Neo.data.Model} model=CountryModel
         * @reactive
         */
        model: CountryModel,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{direction: 'DESC', property: 'population'}],
        /**
         * @member {String} url='../../examples/grid/countries/data/countries.json'
         */
        url: '../../examples/grid/countries/data/countries.json'
    }
}

export default Neo.setupClass(CountryStore);
