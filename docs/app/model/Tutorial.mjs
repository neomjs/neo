import Model  from '../../../src/data/Model.mjs';

/**
 * @class Docs.model.Tutorial
 * @extends Neo.data.Model
 */
class Tutorial extends Model {
    static getConfig() {return {
        /**
         * @member {String} className='Docs.model.Tutorial'
         * @protected
         */
        className: 'Docs.model.Example',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'fileName',
            type: 'String'
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
            name: 'type',
            type: 'String'
        }]
    }}
}

Neo.applyClassConfig(Tutorial);

export {Tutorial as default};