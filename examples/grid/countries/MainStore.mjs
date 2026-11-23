import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @summary 217 economies from the World Bank's World Development Indicators (CC BY 4.0), largest population first.
 *
 * The data ships with the example in `data/countries.json`, which names its source, licence, retrieval date and the
 * series behind each field. Loading it makes no request outside this site.
 * @class Neo.examples.grid.countries.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.countries.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.countries.MainStore',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {Neo.data.Model} model=Model
         */
        model: Model,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{direction: 'DESC', property: 'population'}],
        /**
         * Resolved from the app worker's location, like the calendar examples' data
         * @member {String} url='../../examples/grid/countries/data/countries.json'
         */
        url: '../../examples/grid/countries/data/countries.json'
    }
}

export default Neo.setupClass(MainStore);
