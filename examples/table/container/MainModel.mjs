import Model from '../../../src/data/Model.mjs';

/**
 * @summary Record schema for the service tier specification table example.
 * @class Neo.examples.table.container.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className: 'Neo.examples.table.container.MainModel',

        fields: [{
            name: 'id',
            type: 'String'
        }, {
            name: 'colspan',
            type: 'Object'
        }, {
            name: 'specification',
            type: 'String'
        }, {
            name: 'area',
            type: 'String'
        }, {
            name: 'starter',
            type: 'String'
        }, {
            name: 'production',
            type: 'String'
        }, {
            name: 'notes',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(MainModel);
