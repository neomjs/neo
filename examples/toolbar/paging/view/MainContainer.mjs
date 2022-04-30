import MainContainerController from './MainContainerController.mjs';
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
            flex        : 1,
            reference   : 'user-table',
            wrapperStyle: {maxHeight: '300px'}
        }, {
            module: PagingToolbar,
            flex  : 'none'
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
