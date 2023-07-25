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
            name: 'iconCls',
            type: 'String'
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'items', // optional
            type: 'Array'
        }, {
            name: 'text',
            type: 'String'
        }]
    }
}

Neo.applyClassConfig(Model);

export default Model;
