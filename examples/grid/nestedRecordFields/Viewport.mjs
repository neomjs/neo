import BaseViewport          from '../../../src/container/Viewport.mjs';
import Button                from '../../../src/button/Base.mjs';
import GridContainer         from '../../../src/grid/Container.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

/**
 * @class Neo.examples.grid.nestedRecordFields.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.nestedRecordFields.Viewport'
         * @protected
         */
        className: 'Neo.examples.grid.nestedRecordFields.Viewport',
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         */
        stateProvider: ViewportStateProvider,
        /**
         * @member {Object} style={padding:'1em'}
         */
        style: {padding: '1em'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype    : 'toolbar',
            flex     : 'none',
            reference: 'switch-theme-button',
            style    : {marginBottom: '1em'},

            items: ['->', {
                handler: 'onSwitchDragModeButtonClick',
                iconCls: 'far fa-square',
                style  : {marginRight: '1em'},
                text   : 'Drag column headers only'
            }, {
                handler: 'onSwitchThemeButtonClick',
                iconCls: 'fas fa-sun',
                text   : 'Light Theme'
            }]
        }, {
            module   : GridContainer,
            bind     : {store: 'stores.mainStore'},
            reference: 'grid',

            bodyConfig: {
                highlightModifiedCells: true
            },

            columnDefaults: {
                width: 200
            },

            columns: [
                {dataField: 'user.firstname', text: 'Firstname'},
                {dataField: 'user.lastname',  text: 'Lastname'},
                {dataField: 'githubId',       text: 'Github Id'},
                {dataField: 'date',           text: 'Date'},
                {dataField: 'country',        text: 'Country',     renderer: 'countryRenderer'},
                {dataField: 'edit',           text: 'Edit Action', component: {
                    module : Button,
                    handler: 'editButtonHandler',
                    text   : 'Edit'
                }}
            ]
        }]
    }
}

export default Neo.setupClass(Viewport);
