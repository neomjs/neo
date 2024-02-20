import CheckBox                from '../../../src/form/field/CheckBox.mjs';
import List                    from './List.mjs';
import MainContainerController from './MainContainerController.mjs';
import MainStore               from './MainStore.mjs';
import NumberField             from '../../../src/form/field/Number.mjs';
import TextField               from '../../../src/form/field/Text.mjs';
import Toolbar                 from '../../../src/toolbar/Base.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.list.animate.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.animate.MainContainer'
         * @protected
         */
        className: 'Neo.examples.list.animate.MainContainer',
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
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
                handler     : 'changeSorting',
                iconCls     : 'fas fa-arrow-circle-up',
                iconPosition: 'right',
                reference   : 'firstnameButton',
                text        : 'Firstname'
            }, {
                field       : 'lastname',
                handler     : 'changeSorting',
                iconPosition: 'right',
                reference   : 'lastnameButton',
                text        : 'Lastname'
            }, {
                module    : CheckBox,
                labelText : 'Is online',
                labelWidth: 70,
                listeners : {change: 'changeIsOnlineFilter'},
                style     : {marginLeft: '50px'}
            }]
        }, {
            module    : TextField,
            flex      : 'none',
            labelText : 'Search',
            labelWidth: 60,
            listeners : {change: 'changeNameFilter'},
            style     : {marginLeft: '10px'},
            width     : 262
        }, {
            module              : NumberField,
            clearToOriginalValue: true,
            flex                : 'none',
            labelText           : 'Transition Duration',
            labelWidth          : 150,
            listeners           : {change: 'changeTransitionDuration'},
            maxValue            : 5000,
            minValue            : 100,
            stepSize            : 100,
            style               : {marginLeft: '10px'},
            value               : 500,
            width               : 262
        }, {
            module   : List,
            reference: 'list',
            store    : MainStore
        }]
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
