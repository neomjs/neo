import Model from '../../../src/data/Model.mjs';

/**
 * @summary One economy: its ISO flag code, name and World Bank region, and its latest indicators. A value the World Bank
 * has not published since 2020 is `null`.
 * @class Neo.examples.grid.countries.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.countries.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.countries.MainModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'id',               type: 'String'},
            {name: 'flag',             type: 'String'},
            {name: 'country',          type: 'String'},
            {name: 'region',           type: 'String'},
            {name: 'population',       type: 'Integer'},
            {name: 'populationGrowth', type: 'Float'},
            {name: 'gdp',              type: 'Integer'},
            {name: 'gdpPerCapita',     type: 'Integer'},
            {name: 'gdpGrowth',        type: 'Float'},
            {name: 'lifeExpectancy',   type: 'Float'},
            {name: 'urban',            type: 'Float'},
            {name: 'internet',         type: 'Float'},
            {name: 'electricity',      type: 'Float'}
        ]
    }
}

export default Neo.setupClass(MainModel);
