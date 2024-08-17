import Button                  from '../../../../../src/button/Base.mjs';
import MainContainerController from './MainContainerController.mjs';
import Toolbar                 from '../../../../../src/toolbar/Base.mjs';
import Viewport                from '../../../../../src/container/Viewport.mjs';

/**
 * @class SharedDialog2.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='SharedDialog2.view.MainContainer'
         * @protected
         */
        className: 'SharedDialog2.view.MainContainer',
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} items
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
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'}
    }
}

export default Neo.setupClass(MainContainer);
