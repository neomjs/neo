import Model from '../../../src/data/Model.mjs';

/**
 * @summary One economy of `examples/grid/countries/data/countries.json`, the World Bank indicators the grid shows.
 * @class Neo.examples.component.coronaGallery.CountryModel
 * @extends Neo.data.Model
 */
class CountryModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.coronaGallery.CountryModel'
         * @protected
         */
        className: 'Neo.examples.component.coronaGallery.CountryModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'country',          type: 'String'},
            {name: 'flag',             type: 'String'},
            {name: 'gdp',              type: 'Number'},
            {name: 'gdpPerCapita',     type: 'Number'},
            {name: 'internet',         type: 'Number'},
            {name: 'lifeExpectancy',   type: 'Number'},
            {name: 'population',       type: 'Number'},
            {name: 'populationGrowth', type: 'Number'},
            {name: 'region',           type: 'String'}
        ]
    }
}

export default Neo.setupClass(CountryModel);
