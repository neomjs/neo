import Model from '../../../src/data/Model.mjs';

/**
 * @class Docs.model.Api
 * @extends Neo.data.Model
 */
class Api extends Model {
    static getConfig() {return {
        /**
         * @member {String} className='Docs.model.Api'
         * @protected
         */
        className: 'Docs.model.Api',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'className',
            type: 'String'
        }, {
            name: 'collapsed',
            type: 'Boolean'
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'isLeaf',
            type: 'Boolean'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'parentId',
            type: 'Integer'
        }, {
            name: 'path',
            type: 'String'
        }, {
            name: 'singleton',
            type: 'Boolean'
        }, {
            name: 'srcPath',
            type: 'String'
        }]
    }}
}

Neo.applyClassConfig(Api);

export {Api as default};