import Model from '../../../src/data/Model.mjs';

/**
 * @summary Describes the fictional colleagues displayed by the value-banding example.
 * @class Neo.examples.grid.valueBanding.MainModel
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
            name: 'name',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(MainModel);
