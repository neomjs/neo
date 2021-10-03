import List      from './List.mjs';
import MainStore from './MainStore.mjs';
import Toolbar   from '../../../src/container/Toolbar.mjs';
import Viewport  from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.list.animate.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Neo.examples.list.animate.MainContainer',
        autoMount: true,
        layout   : {ntype: 'vbox', align: 'stretch'}
    }}

    /**
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',

            itemDefaults: {
                ntype: 'button',
                style: {marginRight: '.5em'}
            },

            items : [{
                ntype: 'label',
                text : 'Sort by'
            }, {
                handler: me.changeSorting.bind(me, 'firstname'),
                text   : 'Firstname'
            }, {
                handler: me.changeSorting.bind(me, 'lastname'),
                text   : 'Lastname'
            }]
        }, {
            module      : List,
            displayField: 'firstname',
            store       : MainStore,
            style       : {margin: '10px'}
        }];
    }

    /**
     * @param {String} field
     * @param {Object} data
     */
    changeSorting(field, data) {
        console.log('changeSorting', field);
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
