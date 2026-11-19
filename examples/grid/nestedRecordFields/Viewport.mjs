import BaseViewport          from '../../../src/container/Viewport.mjs';
import Button                from '../../../src/button/Base.mjs';
import GridContainer         from '../../../src/grid/Container.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

/**
 * @summary Partner-directory grid example demonstrating modal dialog editing of nested `user` and `address` record
 * fields with modified-cell highlighting, keyboard navigation, responsive mobile sizing, and Reset.
 * @class Neo.examples.grid.nestedRecordFields.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        className    : 'Neo.examples.grid.nestedRecordFields.Viewport',
        cls          : ['neo-examples-grid-edit-dialog'],
        controller   : ViewportController,
        layout       : {ntype: 'vbox', align: 'stretch'},
        stateProvider: ViewportStateProvider,

        items: [{
            ntype : 'container',
            cls   : ['neo-edit-dialog-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},

            items: [{
                ntype: 'component',
                cls  : ['neo-edit-dialog-intro'],
                vdom : {
                    cn: [
                        {tag: 'h1', cls: ['neo-edit-dialog-title'], text: 'Edit a Row in a Dialog'},
                        {
                            tag : 'p',
                            cls : ['neo-edit-dialog-subtitle'],
                            text: 'Press Edit in any row (or focus Edit and press Enter / Space) to open the form; Save updates nested contact and address fields and highlights modified cells.'
                        }
                    ]
                }
            }, {
                ntype    : 'toolbar',
                cls      : ['neo-edit-dialog-toolbar'],
                flex     : 'none',
                reference: 'switch-theme-button',

                items: [{
                    handler  : 'onResetButtonClick',
                    iconCls  : 'fas fa-rotate-left',
                    reference: 'reset-button',
                    text     : 'Reset'
                }, {
                    handler  : 'onSwitchDragModeButtonClick',
                    iconCls  : 'far fa-square',
                    reference: 'drag-mode-button',
                    text     : 'Drag column headers only'
                }, {
                    handler  : 'onSwitchThemeButtonClick',
                    iconCls  : 'fas fa-sun',
                    reference: 'theme-button',
                    text     : 'Light Theme'
                }]
            }]
        }, {
            module   : GridContainer,
            bind     : {store: 'stores.mainStore'},
            flex     : 1,
            reference: 'grid',
            rowHeight: 36,

            body: {
                highlightModifiedCells: true
            },

            columns: [
                {dataField: 'user.firstname',  text: 'First Name',   width: 108},
                {dataField: 'user.lastname',   text: 'Last Name',    width: 118},
                {
                    dataField: 'edit',
                    text     : 'Edit',
                    sortable : false,
                    width    : 84,
                    component: {
                        module : Button,
                        handler: 'editButtonHandler',
                        text   : 'Edit'
                    }
                },
                {dataField: 'address.city',    text: 'City',         width: 138},
                {dataField: 'address.country', text: 'Country',      width: 158, renderer: 'countryRenderer'},
                {dataField: 'organization',    text: 'Organization', flex: 1, minWidth: 180},
                {dataField: 'role',            text: 'Role',         width: 165},
                {dataField: 'date',            text: 'Renewal Date', width: 130}
            ]
        }]
    }
}

export default Neo.setupClass(Viewport);
