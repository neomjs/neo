import Model from '../../../src/data/Model.mjs';

/**
 * @summary One portrait of the team wall. `order` starts at the record's `id` and a drag rewrites it.
 * @class Neo.examples.list.reorder.PersonModel
 * @extends Neo.data.Model
 */
class PersonModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.reorder.PersonModel'
         * @protected
         */
        className: 'Neo.examples.list.reorder.PersonModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'firstname', type: 'String'},
            {name: 'id',        type: 'Integer'},
            {name: 'image',     type: 'String'},
            {name: 'lastname',  type: 'String'},
            // The shared portrait file carries no order; a mapping only fills the initial value
            {name: 'order',     type: 'Integer', mapping: 'id'}
        ]
    }
}

export default Neo.setupClass(PersonModel);
