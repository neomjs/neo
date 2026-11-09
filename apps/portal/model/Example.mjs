import Model from '../../../src/data/Model.mjs';

/**
 * @summary A canonical example identity, caption and explicit destinations for each build mode.
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
            name: 'component',
            type: 'String'
        }, {
            name        : 'environments',
            type        : 'Array',
            defaultValue: ['Desktop']
        }, {
            name: 'family',
            type: 'String'
        }, {
            name: 'feature',
            type: 'String'
        }, {
            name        : 'hidden',
            type        : 'Boolean',
            defaultValue: false
        }, {
            name        : 'hiddenIn',
            type        : 'Array',
            defaultValue: []
        }, {
            name: 'id',
            type: 'String'
        }, {
            name: 'image',
            type: 'String'
        }, {
            name: 'lookFor',
            type: 'String'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'scope',
            type: 'String'
        }, {
            name        : 'sharedWorkers',
            type        : 'Boolean',
            defaultValue: false
        }, {
            name: 'sourceUrl',
            type: 'String'
        }, {
            name: 'sourceUrls',
            type: 'Object'
        }, {
            name: 'urls',
            type: 'Object'
        }]
    }
}

export default Neo.setupClass(Example);
