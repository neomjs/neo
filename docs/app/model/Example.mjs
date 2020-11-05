import Model  from '../../../src/data/Model.mjs';

/**
 * @class Docs.app.model.Example
 * @extends Neo.data.Model
 */
class Example extends Model {
    static getConfig() {return {
        /**
         * @member {String} className='Docs.app.model.Example'
         * @protected
         */
        className: 'Docs.app.model.Example',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'collapsed', // optional, only needed for collapsed non leaf items
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
        }]
    }}
}

Neo.applyClassConfig(Example);

export {Example as default};