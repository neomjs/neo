import Model from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.grid.container.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className: 'Neo.examples.grid.valueBanding.MainModel',

        fields: [{
            name: 'id',
            type: 'Number'
        }, {
            name: 'country',
            type: 'String'
        }, {
            name: 'department',
            type: 'String'
        }, {
            name: 'role',
            type: 'String'
        }, {
            name: 'firstname',
            type: 'String'
        }, {
            name: 'lastname',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(MainModel);
