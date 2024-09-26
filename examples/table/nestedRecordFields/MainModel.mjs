import Model from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.table.nestedRecordFields.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className: 'Neo.examples.table.container.MainModel',

        fields: [{
            name: 'country',
            type: 'String'
        }, {
            name: 'githubId',
            type: 'String'
        }, {
            name: 'user',
            type: 'Object',

            fields: [{
                name: 'user.firstname',
                type: 'String'
            }, {
                name: 'user.lastname',
                type: 'String'
            }]
        }]
    }
}

export default Neo.setupClass(MainModel);
