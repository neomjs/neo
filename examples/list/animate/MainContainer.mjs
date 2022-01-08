import CheckBox    from '../../../src/form/field/CheckBox.mjs';
import List        from './List.mjs';
import MainStore   from './MainStore.mjs';
import NumberField from '../../../src/form/field/Number.mjs';
import TextField   from '../../../src/form/field/Text.mjs';
import Toolbar     from '../../../src/container/Toolbar.mjs';
import Viewport    from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.list.animate.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Neo.examples.list.animate.MainContainer',
        autoMount: true,
        layout   : {ntype: 'vbox', align: 'stretch'},
        sortBy   : 'firstname'
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

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
                field       : 'firstname',
                handler     : me.changeSorting.bind(me, 'firstname'),
                iconCls     : 'fas fa-arrow-circle-up',
                iconPosition: 'right',
                text        : 'Firstname'
            }, {
                field       : 'lastname',
                handler     : me.changeSorting.bind(me, 'lastname'),
                iconPosition: 'right',
                text        : 'Lastname'
            }, {
                module    : CheckBox,
                labelText : 'Is online',
                labelWidth: 70,
                listeners : {change: me.changeIsOnlineFilter.bind(me)},
                style     : {marginLeft: '50px'}
            }]
        }, {
            module    : TextField,
            flex      : 'none',
            labelText : 'Search',
            labelWidth: 60,
            listeners : {change: me.changeNameFilter.bind(me)},
            style     : {marginLeft: '10px'},
            width     : 262
        }, {
            module              : NumberField,
            clearToOriginalValue: true,
            flex                : 'none',
            labelText           : 'Transition Duration',
            labelWidth          : 150,
            listeners           : {change: me.changeTransitionDuration.bind(me)},
            maxValue            : 5000,
            minValue            : 100,
            stepSize            : 100,
            style               : {marginLeft: '10px'},
            value               : 2000,
            width               : 262
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
     * @param {Object} data
     */
    changeNameFilter(data) {
        let store = this.down({module: List}).store;

        store.getFilter('name').value = data.value;
    }

    /**
     * @param {String} property
     * @param {Object} data
     */
    changeSorting(property, data) {
        let me              = this,
            buttonFirstName = me.down({field: 'firstname'}),
            buttonLastName  = me.down({field: 'lastname'}),
            direction       = 'ASC',
            store           = me.down({module: List}).store,
            sorter          = store.sorters[0],
            button;

        button = property === 'firstname' ? buttonFirstName : buttonLastName;

        if (property === me.sortBy) {
            direction = sorter.direction === 'ASC' ? 'DESC' : 'ASC';
        }

        button.iconCls = `fas fa-arrow-circle-${direction === 'ASC' ? 'up' : 'down'}`;

        button = button === buttonFirstName ? buttonLastName : buttonFirstName;
        button.iconCls = null;

        sorter.set({direction, property});

        me.sortBy = property;
    }

    /**
     * @param {Object} data
     */
    changeTransitionDuration(data) {
        this.down({module: List}).getPlugin('animate').transitionDuration = data.value;
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
