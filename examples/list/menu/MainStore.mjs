import MainModel from './MainModel.mjs';
import Store     from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.list.menu.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static getConfig() {return {
        className: 'Neo.examples.list.menu.MainStore',
        model    : MainModel,

        data: [{
            iconCls: 'fa fa-user',
            id     : 1,
            name   : 'Item 1'
        }, {
            iconCls: 'fa fa-home',
            id     : 2,
            name   : 'Item 2'
        }, {
            iconCls: 'fa fa-cog',
            id     : 3,
            name   : 'Item 3'
        }, {
            iconCls: 'fa fa-user',
            id     : 4,
            name   : 'Item 4'
        }, {
            iconCls: 'fa fa-user',
            id     : 5,
            name   : 'Item 5'
        }],

        sorters: [{
            property : 'id',
            direction: 'ASC'
        }]
    }}
}

Neo.applyClassConfig(MainStore);

export {MainStore as default};
