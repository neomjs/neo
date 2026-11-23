import Model from '../../../src/data/Model.mjs';

/**
 * @summary One key figure of the sortable dashboard: its label, how its reading reads, whether a rise is good news,
 * the latest reading and the readings before it.
 * @class Neo.examples.dashboard.sortable.KpiModel
 * @extends Neo.data.Model
 */
class KpiModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.sortable.KpiModel'
         * @protected
         */
        className: 'Neo.examples.dashboard.sortable.KpiModel',
        /**
         * `history` holds the last readings, oldest first, the latest one included.
         * @member {Object[]} fields
         */
        fields: [
            {name: 'format',  type: 'String'},
            {name: 'history'},
            {name: 'id',      type: 'String'},
            {name: 'label',   type: 'String'},
            {name: 'rising',  type: 'String'},
            {name: 'value',   type: 'Number'}
        ]
    }
}

export default Neo.setupClass(KpiModel);
