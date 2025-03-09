import Model from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.grid.animatedRowSorting.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.animatedRowSorting.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.animatedRowSorting.MainModel',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'country',
            type: 'String'
        }, {
            name: 'firstname',
            type: 'String'
        }, {
            name: 'id',
            type: 'Int'
        }, {
            name: 'lastname',
            type: 'String'
        }, {
            name: 'progress',
            type: 'Int'
        }],
        /**
         * @member {Boolean} trackModifiedFields=true
         */
        trackModifiedFields: true
    }
}

export default Neo.setupClass(MainModel);
