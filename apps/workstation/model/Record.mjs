import Model from '../../../src/data/Model.mjs';

/**
 * @summary The compact record contract shared by Workstation's scale and live-feed stores.
 *
 * One target-owned model keeps the two panes honest without importing either precedent's
 * product schema. The 100k store carries raw objects until the grid hydrates its viewport;
 * the feed store carries ordinary records so each batched insert updates visible component
 * and Sparkline cells through the normal Store<Model> path.
 *
 * @class Workstation.model.Record
 * @extends Neo.data.Model
 */
class Record extends Model {
    static config = {
        /**
         * @member {String} className='Workstation.model.Record'
         * @protected
         */
        className: 'Workstation.model.Record',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'status',
            type: 'String'
        }, {
            name: 'timestamp',
            type: 'String'
        }, {
            name: 'value',
            type: 'Int'
        }, {
            name: 'counter',
            type: 'Int'
        }, {
            name: 'progress',
            type: 'Int'
        }, {
            // New arrays are assigned on each pulse so pooled Sparkline components observe
            // a new record version instead of an in-place mutation that can short-circuit.
            name: 'trend'
        }],
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id'
    }
}

export default Neo.setupClass(Record);
