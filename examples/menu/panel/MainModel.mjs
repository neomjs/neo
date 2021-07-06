import Model  from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.menu.panel.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static getConfig() {return {
        className  : 'Neo.examples.menu.panel.MainModel',
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

Neo.applyClassConfig(MainModel);

export {MainModel as default};
