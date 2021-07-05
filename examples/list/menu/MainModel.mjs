import Model  from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.list.menu.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static getConfig() {return {
        className  : 'Neo.examples.list.menu.MainModel',
        keyProperty: 'id',

        fields: [{
            name: 'iconCls',
            type: 'String'
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'name',
            type: 'String'
        }]
    }}
}

Neo.applyClassConfig(MainModel);

export {MainModel as default};
