import Store from '../../../src/menu/Store.mjs';

/**
 * @class Neo.examples.menu.list.MainStore
 * @extends Neo.menu.Store
 */
class MainStore extends Store {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.menu.list.MainStore'
         * @protected
         */
        className: 'Neo.examples.menu.list.MainStore',
        /**
         * @member {Object[]} data
         */
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
