import Model from '../../../src/data/Model.mjs';

/**
 * @summary Represents one equity row rendered in the live Finance market desk grid.
 * @class Finance.model.Company
 * @extends Neo.data.Model
 */
class Company extends Model {
    static config = {
        /**
         * @member {String} className='Finance.model.Company'
         * @protected
         */
        className: 'Finance.model.Company',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name        : 'change',
            defaultValue: 0,
            type        : 'Float'
        }, {
            name        : 'changePercent',
            defaultValue: 0,
            type        : 'Float'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name        : 'priorClose',
            defaultValue: 0,
            type        : 'Float'
        }, {
            name: 'sector',
            type: 'String'
        }, {
            name: 'symbol',
            type: 'String'
        }, {
            name        : 'tickDelta',
            defaultValue: 0,
            type        : 'Float'
        }, {
            name        : 'value',
            defaultValue: 0,
            type        : 'Float'
        }, {
            name        : 'volume',
            defaultValue: 0,
            type        : 'Integer'
        }]
    }
}

export default Neo.setupClass(Company);
