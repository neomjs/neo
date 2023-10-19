import MainContainerController from './MainContainerController.mjs';
import MainContainerModel      from './MainContainerModel.mjs';
import PagingToolbar           from '../../../../src/toolbar/Paging.mjs';
import UserTableContainer      from './UserTableContainer.mjs';
import Viewport                from '../../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.toolbar.paging.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.paging.view.MainContainer'
         * @protected
         */
        className: 'Neo.examples.toolbar.paging.view.MainContainer',
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'toolbar',
            flex : 'none',
            items: ['->', {
                handler: 'onAddUserButtonClick',
                iconCls: 'fa fa-circle-plus',
                text   : 'Add User',
                tooltip: 'Open a dialog and edit a new user'
            }, {
                handler: 'onShowFiltersButtonClick',
                iconCls: 'fa fa-filter',
                style  : {marginLeft: '2px'},
                text   : 'Show Filters',
                tooltip: 'Show filters for the user'
            }]
        }, {
            module      : UserTableContainer,
            bind        : {store: 'stores.users'},
            flex        : 1,
            reference   : 'user-table',
            wrapperStyle: {maxHeight: '300px'}
        }, {
            module: PagingToolbar,
            bind  : {store: 'stores.users'},
            flex  : 'none',

            // We want to apply custom configs to the provided item references
            items: {
                'nav-button-first': {
                    tooltip: 'Go to first page'
                },
                'nav-button-prev' : {
                    tooltip: 'Go to previous page'
                },
                'nav-button-next' : {
                    tooltip: 'Go to next page'
                },
                'nav-button-last' : {
                    tooltip: 'Go to last page'
                },

                // These two have been moved to the start of the Toolbar by their weights
                label: {
                    style : {marginLeft: 0},
                    weight: -10000,

                    // Embed a tooltip request into the DOM
                    vdom  : {
                        data : {
                            'neo-tooltip' : 'The Label'
                        }
                    }
                },
                rowsPerPage: {
                    style  : {margin: '0 .5em'},
                    tooltip: 'Set the number of rows to display in a page',
                    weight : -999
                }
            }
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Neo.model.Component} model=MainContainerModel
         */
        model: MainContainerModel,
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'}
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
