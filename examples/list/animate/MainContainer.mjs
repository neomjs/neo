import CheckBox  from '../../../src/form/field/CheckBox.mjs';
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
            }, {
                module    : CheckBox,
                labelText : 'Is online',
                labelWidth: 70,
                listeners : {change: me.changeIsOnlineFilter.bind(me)},
                style     : {marginLeft: '50px'}
            }]
        }, {
            module: List,
            store : MainStore
        }];
    }

    /**
     * @param {Object} data
     */
    changeIsOnlineFilter(data) {
        let store = this.down({module: List}).store;

        store.getFilter('isOnline').disabled = !data.value;
    }

    /**
     * @param {String} field
     * @param {Object} data
     */
    changeSorting(field, data) {
        let store = this.down({module: List}).store;

        store.sorters[0].property = field;
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
