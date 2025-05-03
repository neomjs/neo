import Model from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.list.animate.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className  : 'Neo.examples.list.animate.MainModel',
        keyProperty: 'id',

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

export default Neo.setupClass(MainModel);
