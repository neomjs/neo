import Button                  from '../../../src/button/Base.mjs';
import MainContainerController from './MainContainerController.mjs';
import Toolbar                 from '../../../src/toolbar/Base.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.remotesApi.basic.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className : 'Neo.examples.remotesApi.basic.MainContainer',
        autoMount : true,
        controller: MainContainerController,
        layout    : {ntype: 'vbox', align: 'stretch'},

        items: [{
            module   : Toolbar,
            flex     : 'none',
            padding  : 20,
            reference: 'headerToolbar',

            style: {
                backgroundColor: '#f2f2f2',
                padding        : '10px 5px 10px 10px'
            },

            items: [{
                module : Button,
                handler: 'onGetAllUsersButtonClick',
                height : 27,
                iconCls: 'fa fa-users',
                text   : 'Get all users'
            }, {
                module : Button,
                handler: 'onGetAllFriendsButtonClick',
                height : 27,
                iconCls: 'fab fa-github',
                style  : {marginLeft: '5px'},
                text   : 'Get all friends'
            }, {
                module : Button,
                handler: 'onGetAllUsersPlusFriendsButtonClick',
                height : 27,
                iconCls: 'fa-regular fa-heart',
                style  : {marginLeft: '5px'},
                text   : 'Get users & friends'
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
