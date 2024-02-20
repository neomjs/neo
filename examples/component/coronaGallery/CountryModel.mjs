import Model from '../../../src/data/Model.mjs';

/**
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
        fields: [{
            name: 'cases',
            type: 'int'
        }, {
            name: 'country',
            type: 'string'
        }, {
            name: 'critical',
            type: 'int'
        }, {
            name: 'deaths',
            type: 'int'
        }, {
            name: 'recovered',
            type: 'int'
        }, {
            name: 'todayCases',
            type: 'int'
        }, {
            name: 'todayDeaths',
            type: 'int'
        }]
    }
}

Neo.setupClass(CountryModel);

export default CountryModel;
