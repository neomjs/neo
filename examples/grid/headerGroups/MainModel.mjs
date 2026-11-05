import Model from '../../../src/data/Model.mjs';

export const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * @summary One region's monthly sales and their yearly total.
 * @class Neo.examples.grid.headerGroups.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.headerGroups.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.headerGroups.MainModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'id',     type: 'Integer'},
            {name: 'region', type: 'String'},
            ...months.map(name => ({name, type: 'Integer'})),
            {name: 'total',  type: 'Integer'}
        ]
    }
}

export default Neo.setupClass(MainModel);
