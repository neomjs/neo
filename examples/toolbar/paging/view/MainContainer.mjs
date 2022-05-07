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
        className : 'Neo.examples.toolbar.paging.view.MainContainer',
        autoMount : true,
        controller: MainContainerController,
        layout    : {ntype: 'vbox', align: 'stretch'},
        model     : MainContainerModel,
        style     : {padding: '20px'},

        items: [{
            ntype: 'toolbar',
            flex : 'none',
            items: ['->', {
                handler: 'onAddUserButtonClick',
                iconCls: 'fa fa-circle-plus',
                text   : 'Add User'
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
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
