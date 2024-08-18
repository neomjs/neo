import Model from '../../../src/data/Model.mjs';

/**
 * @class  Neo.examples.model.table.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className: 'Neo.examples.model.table.MainModel',

        fields: [{
            name: 'country',
            type: 'string'
        }, {
            name: 'firstname',
            type: 'string'
        }, {
            name: 'githubId',
            type: 'string'
        }, {
            name: 'lastname',
            type: 'string'
        }]
    }
}

export default Neo.setupClass(MainModel);
