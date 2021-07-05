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
            name   : 'Group 1',
            items  : [{
                iconCls: 'fa fa-home',
                id     : 6,
                name   : 'Item 1'
            }, {
                iconCls: 'fa fa-home',
                id     : 7,
                name   : 'Item 2'
            }, {
                iconCls: 'fa fa-home',
                id     : 8,
                name   : 'Item 3'
            }]
        }, {
            iconCls: 'fa fa-cog',
            id     : 3,
            name   : 'Item 2'
        }, {
            iconCls: 'far fa-calendar',
            id     : 4,
            name   : 'Item 3'
        }, {
            iconCls: 'far fa-clock',
            id     : 5,
            name   : 'Group 2',
            items  : [{
                iconCls: 'fa fa-clock',
                id     : 9,
                name   : 'Item 1'
            }, {
                iconCls: 'fa fa-clock',
                id     : 10,
                name   : 'Item 2'
            }, {
                iconCls: 'fa fa-clock',
                id     : 11,
                name   : 'Item 3'
            }]
        }]
    }}
}

Neo.applyClassConfig(MainStore);

export {MainStore as default};
