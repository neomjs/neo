import Model from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.grid.nestedRecordFields.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.nestedRecordFields.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.nestedRecordFields.MainModel',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'annotations',
            type: 'Object',

            fields: [{
                name        : 'selected',
                type        : 'Boolean',
                defaultValue: false
            }]
        }, {
            name: 'country',
            type: 'String'
        }, {
            name: 'edit',
            type: 'String'
        }, {
            name: 'githubId',
            type: 'String'
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
        }],
        /**
         * @member {Boolean} trackModifiedFields=true
         */
        trackModifiedFields: true
    }
}

export default Neo.setupClass(MainModel);
