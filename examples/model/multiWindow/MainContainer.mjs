import MainContainerController from './MainContainerController.mjs'
import Panel                   from '../../../src/container/Panel.mjs';

/**
 * @class Neo.examples.model.multiWindow.MainContainer
 * @extends Neo.container.Panel
 */
class MainContainer extends Panel {
    static config = {
        /**
         * @member {String} className='Neo.examples.model.multiWindow.MainContainer'
         * @protected
         */
        className: 'Neo.examples.model.multiWindow.MainContainer',
        /**
         * @member {Object} containerConfig
         */
        containerConfig: {
            layout: {
                ntype: 'vbox',
                align: 'start'
            },

            style: {
                padding: '20px'
            }
        },
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} headers
         */
        headers: [{
            dock : 'top',
            items: [{
                ntype: 'label',
                bind : {
                    text: data => `Current user: ${data.user.firstname} ${data.user.lastname}`
                }
            }, {
                ntype: 'component',
                flex : 1
            }, {
                handler  : 'onEditUserButtonClick',
                iconCls  : 'fa fa-user',
                reference: 'edit-user-button',
                text     : 'Edit user'
            }]
        }],
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'label',
            text : 'Click the edit user button to edit the user data inside this container view model.'
        }]
    }
}

export default Neo.setupClass(MainContainer);
