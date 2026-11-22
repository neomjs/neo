import Model from '../../../src/data/Model.mjs';

/**
 * @summary One row of the report the pipeline hands to the store: a country and its totals.
 * @class Neo.examples.data.pipeline.ReportModel
 * @extends Neo.data.Model
 */
class ReportModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.data.pipeline.ReportModel'
         * @protected
         */
        className: 'Neo.examples.data.pipeline.ReportModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'country',   type: 'String'},
            {name: 'orders',    type: 'Integer'},
            {name: 'revenue',   type: 'Integer'},
            {name: 'average',   type: 'Integer'},
            {name: 'customers', type: 'Integer'},
            {name: 'bestMonth', type: 'String'}
        ],
        /**
         * @member {String} keyProperty='country'
         */
        keyProperty: 'country'
    }
}

export default Neo.setupClass(ReportModel);
