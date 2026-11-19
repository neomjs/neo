import Model from '../../../src/data/Model.mjs';

/**
 * @summary Record schema with nested `user` (`firstname`, `lastname`) and `address` (`city`, `country`) fields
 * and `trackModifiedFields: true` for dialog-based row editing.
 * @class Neo.examples.grid.nestedRecordFields.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className          : 'Neo.examples.grid.nestedRecordFields.MainModel',
        trackModifiedFields: true,

        fields: [{
            name: 'id',
            type: 'String'
        }, {
            name: 'annotations',
            type: 'Object',

            fields: [{
                name        : 'selected',
                type        : 'Boolean',
                defaultValue: false
            }]
        }, {
            name: 'user',
            type: 'Object',

            fields: [{
                name: 'firstname',
                type: 'String'
            }, {
                name: 'lastname',
                type: 'String'
            }]
        }, {
            name: 'address',
            type: 'Object',

            fields: [{
                name: 'city',
                type: 'String'
            }, {
                name: 'country',
                type: 'String'
            }]
        }, {
            name: 'organization',
            type: 'String'
        }, {
            name: 'role',
            type: 'String'
        }, {
            name: 'date',
            type: 'String'
        }, {
            name: 'edit',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(MainModel);
