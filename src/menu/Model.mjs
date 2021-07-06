import BaseModel from '../../src/data/Model.mjs';

/**
 * @class Neo.menu.Model
 * @extends Neo.data.Model
 */
class Model extends BaseModel {
    static getConfig() {return {
        className  : 'Neo.menu.Model',
        keyProperty: 'id',

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
            name: 'name',
            type: 'String'
        }]
    }}
}

Neo.applyClassConfig(Model);

export {Model as default};
