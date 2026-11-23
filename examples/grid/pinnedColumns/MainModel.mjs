import Model from '../../../src/data/Model.mjs';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The 36 months of the plan, Jan 2026 to Dec 2028, each `{field, text, year}`: the data field, the month's header
 * and the year it groups under
 * @type {Object[]}
 */
export const months = Array.from({length: 36}, (_, index) => ({
    field: 'm' + index,
    text : monthNames[index % 12],
    year : 2026 + Math.floor(index / 12)
}));

/**
 * @summary One product in one region: its planned units per month for three years, and their total.
 * @class Neo.examples.grid.pinnedColumns.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.pinnedColumns.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.pinnedColumns.MainModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'id',      type: 'Integer'},
            {name: 'product', type: 'String'},
            {name: 'region',  type: 'String'},
            ...months.map(({field}) => ({name: field, type: 'Integer'})),
            {name: 'total',   type: 'Integer'}
        ]
    }
}

export default Neo.setupClass(MainModel);
