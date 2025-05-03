import Model from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.list.base.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className  : 'Neo.examples.list.base.MainModel',
        keyProperty: 'githubId',

        fields: [{
            name: 'country',
            type: 'String'
        }, {
            name: 'disabled',
            type: 'Boolean'
        }, {
            name: 'firstname',
            type: 'String'
        }, {
            name: 'githubId',
            type: 'String'
        }, {
            name: 'lastname',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(MainModel);
