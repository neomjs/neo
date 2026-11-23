import MainContainerController from './MainContainerController.mjs';
import Panel                   from '../../../src/container/Panel.mjs';
import ThemeSwitcher           from '../../../src/button/ThemeSwitcher.mjs';

/**
 * @summary Shared-state multi-window demonstration panel whose primary instance launches the companion window.
 * @class Neo.examples.stateProvider.multiWindow.MainContainer
 * @extends Neo.container.Panel
 */
class MainContainer extends Panel {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.multiWindow.MainContainer'
         * @protected
         */
        className: 'Neo.examples.stateProvider.multiWindow.MainContainer',
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
         * @reactive
         */
        controller: MainContainerController
    }

    /**
     * @summary Builds per-instance header and body items so only the provider-owning window offers the opener button.
     */
    createItems() {
        let me           = this,
            ownsProvider = !me.stateProvider?.parent;

        me.headers = [{
            dock  : 'top',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                ntype: 'label',
                bind : {
                    text: data => `Current user: ${data.user.firstname} ${data.user.lastname}`
                }
            }, {
                ntype: 'component',
                flex : 1
            }, ...(ownsProvider ? [{
                handler  : 'onOpenSecondWindowButtonClick',
                iconCls  : 'fa fa-window-restore',
                reference: 'open-second-window-button',
                text     : 'Open second window'
            }] : []), {
                handler  : 'onEditUserButtonClick',
                iconCls  : 'fa fa-user',
                reference: 'edit-user-button',
                text     : 'Edit user'
            }, {
                module: ThemeSwitcher
            }]
        }];

        me.items = [{
            ntype: 'label',
            style: {
                maxWidth  : '100%',
                whiteSpace: 'normal'
            },
            text : ownsProvider
                ? 'Press Open second window to launch the companion window, then use Edit user to update Current user in both windows.'
                : 'This companion window shares the primary window\'s state provider. Use Edit user to update Current user in both.'
        }];

        super.createItems()
    }
}

export default Neo.setupClass(MainContainer);
