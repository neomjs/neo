import BaseModel from '../../src/data/Model.mjs';

/**
 * @class Neo.menu.Model
 * @extends Neo.data.Model
 */
class Model extends BaseModel {
    static config = {
        /**
         * @member {String} className='Neo.menu.Model'
         * @protected
         */
        className: 'Neo.menu.Model',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'cls',
            type: 'Array'
        }, {
            name: 'handler',
            type: 'Function'
        }, {
            name: 'hidden',
            type: 'Boolean'
        }, {
            name: 'iconCls',
            type: 'String'
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'items', // optional
            type: 'Array'
        }, {
            name: 'route',
            type: 'String'
        }, {
            name: 'text',
            type: 'String'
        }]
    }
}

Neo.applyClassConfig(Model);

export default Model;
