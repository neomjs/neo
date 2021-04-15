import ComponentModel          from '../../../src/model/Component.mjs';
import MainContainerController from './MainContainerController.mjs'
import Panel                   from '../../../src/container/Panel.mjs';
import TextField               from '../../../src/form/field/Text.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.model.dialog.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.model.dialog.MainContainer'
         * @protected
         */
        className: 'Neo.examples.model.dialog.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object|Neo.model.Component} model
         */
        model: {
            module: ComponentModel,

            data: {
                user: {
                    firstname: 'Tobias',
                    lastname : 'Uhlig'
                }
            }
        },
        /**
         * @member {Object} style
         */
        style: {
            padding: '20px'
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Panel,

            containerConfig: {
                layout: {
                    ntype: 'vbox',
                    align: 'start'
                },

                style: {
                    padding: '20px'
                }
            },

            headers: [{
                dock : 'top',
                items: [{
                    ntype: 'label',
                    bind : {
                        text: 'Current user: ${data.user.firstname} ${data.user.lastname}'
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

            items: [{
                ntype: 'label',
                text : 'Click the edit user button to edit the user data inside the view model.'
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};