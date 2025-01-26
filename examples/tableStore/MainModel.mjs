import Model from '../../src/data/Model.mjs';

/**
 * @class Neo.examples.tableStore.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className: 'Neo.examples.tableStore.MainModel',

        fields: [{
            name: 'country',
            type: 'html'
        }, {
            name: 'firstname',
            type: 'html'
        }, {
            name: 'githubId',
            type: 'string'
        }, {
            name: 'lastname',
            type: 'html'
        }]
    }
}

export default Neo.setupClass(MainModel);
