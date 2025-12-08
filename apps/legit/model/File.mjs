import Model from '../../../src/data/Model.mjs';

/**
 * @class Legit.model.File
 * @extends Neo.data.Model
 */
class File extends Model {
    static config = {
        /**
         * @member {String} className='Legit.model.File'
         * @protected
         */
        className: 'Legit.model.File',
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
            name: 'hidden',
            type: 'Boolean'
        }, {
            name: 'id',
            type: 'String'
        }, {
            name        : 'isLeaf',
            type        : 'Boolean',
            defaultValue: true
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'parentId',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(File);
