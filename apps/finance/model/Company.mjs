import Model from '../../../src/data/Model.mjs';

/**
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
            defaultValue: null,
            type        : 'Float'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'sector',
            type: 'String'
        }, {
            name: 'symbol',
            type: 'String'
        }, {
            name: 'value',
            type: 'Float'
        }]
    }
}

export default Neo.setupClass(Company);
