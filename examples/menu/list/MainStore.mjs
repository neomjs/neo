import Store from '../../../src/menu/Store.mjs';

/**
 * @class Neo.examples.menu.list.MainStore
 * @extends Neo.menu.Store
 */
class MainStore extends Store {
    static config = {
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
            text   : 'Item 1'
        }, {
            iconCls: 'fa fa-home',
            id     : 2,
            text   : 'Group 1',
            items  : [{
                iconCls: 'fa fa-home',
                id     : 6,
                text   : 'Item 1'
            }, {
                iconCls: 'fa fa-home',
                id     : 7,
                text   : 'Item 2'
            }, {
                iconCls: 'fa fa-home',
                id     : 8,
                text   : 'Item 3'
            }]
        }, {
            iconCls: 'fa fa-cog',
            id     : 3,
            text   : 'Item 2'
        }, {
            iconCls: 'far fa-calendar',
            id     : 4,
            text   : 'Item 3'
        }, {
            iconCls: 'far fa-clock',
            id     : 5,
            text   : 'Group 2',
            items  : [{
                iconCls: 'fa fa-clock',
                id     : 9,
                text   : 'Item 1'
            }, {
                iconCls: 'fa fa-clock',
                id     : 10,
                text   : 'Item 2'
            }, {
                iconCls: 'fa fa-clock',
                id     : 11,
                text   : 'Item 3'
            }]
        }]
    }
}

export default Neo.setupClass(MainStore);
