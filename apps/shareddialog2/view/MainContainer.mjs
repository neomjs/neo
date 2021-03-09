import Button                  from '../../../src/button/Base.mjs';
import MainContainerController from './MainContainerController.mjs';
import Toolbar                 from '../../../src/container/Toolbar.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class SharedDialog2.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'SharedDialog2.view.MainContainer',
        ntype    : 'main-container2',

        autoMount : true,
        controller: MainContainerController,
        layout    : {ntype: 'vbox', align: 'stretch'},
        style     : {padding: '20px'},

        /**
         * Custom config which gets passed to the dialog
         * Either a dom node id, 'document.body' or null
         * @member {String|null} boundaryContainerId='document.body'
         */
        boundaryContainerId: 'document.body',
        /**
         * Custom config
         * @member {Neo.dialog.Base|null} dialog=null
         */
        dialog: null,
        /**
         * @member {Array} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            items :[{
                module  : Button,
                disabled: true,
                flag    : 'open-dialog-button',
                handler : 'onCreateDialogButtonClick',
                iconCls : 'far fa-window-maximize',
                text    : 'Create Dialog'
            }]
        }, {
            ntype: 'component',
            flex : 1,
            html : '#2',

            style: {
                alignItems    : 'center',
                color         : '#bbb',
                display       : 'flex',
                fontSize      : '200px',
                justifyContent: 'center',
                userSelect    : 'none'
            }
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};