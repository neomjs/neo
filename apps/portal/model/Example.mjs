import Model from '../../../src/data/Model.mjs';

/**
 * @class Portal.model.Example
 * @extends Neo.data.Model
 */
class Example extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.Example'
         * @protected
         */
        className: 'Portal.model.Example',
        /**
         * @member {Object[]} fields
         * @protected
         */
        fields: [{
            name: 'backgroundColor',
            type: 'String'
        }, {
            name        : 'browsers',
            type        : 'Array',
            defaultValue: ['Chrome', 'Edge', 'Firefox', 'Safari']
        }, {
            name        : 'environments',
            type        : 'Array',
            defaultValue: ['Desktop']
        }, {
            name        : 'hidden',
            type        : 'Boolean',
            defaultValue: false
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'image',
            type: 'String'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name        : 'sharedWorkers',
            type        : 'Boolean',
            defaultValue: false
        }, {
            name: 'sourceUrl',
            type: 'String'
        }, {
            name: 'url',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(Example);
