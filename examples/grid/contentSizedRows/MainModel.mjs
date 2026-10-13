import Model from '../../../src/data/Model.mjs';

/**
 * @summary A record whose text fields wrap to different line counts.
 * @class Neo.examples.grid.contentSizedRows.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.contentSizedRows.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.contentSizedRows.MainModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'country', type: 'String'},
            {name: 'details', type: 'String'},
            {name: 'id',      type: 'Integer'},
            {name: 'notes',   type: 'String'},
            {name: 'owner',   type: 'String'},
            {name: 'score',   type: 'Integer'},
            {name: 'status',  type: 'String'},
            {name: 'summary', type: 'String'},
            {name: 'title',   type: 'String'}
        ]
    }
}

export default Neo.setupClass(MainModel);
