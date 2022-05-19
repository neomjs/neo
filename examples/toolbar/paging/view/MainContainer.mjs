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
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.toolbar.paging.view.MainContainer'
         * @protected
         */
        className: 'Neo.examples.toolbar.paging.view.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
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
                text   : 'Add User'
            }, {
                handler: 'onShowFiltersButtonClick',
                iconCls: 'fa fa-filter',
                style  : {marginLeft: '2px'},
                text   : 'Show Filters'
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
            flex  : 'none'
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
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
