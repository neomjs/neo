import Model from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.component.helix.ImageModel
 * @extends Neo.data.Model
 */
class ImageModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.helix.ImageModel'
         * @protected
         */
        className: 'Neo.examples.component.helix.ImageModel',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'firstname',
            type: 'String'
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'image',
            type: 'String'
        }, {
            name: 'isOnline',
            type: 'Boolean'
        }, {
            name: 'lastname',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(ImageModel);
