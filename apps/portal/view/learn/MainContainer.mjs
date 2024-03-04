import Container               from '../../../../src/container/Base.mjs';
import ContentTreeList         from './ContentTreeList.mjs';
import ContentView             from './ContentView.mjs';
import MainContainerController from './MainContainerController.mjs';
import MainContainerModel      from './MainContainerModel.mjs';
import PageSectionsPanel       from './PageSectionsPanel.mjs';
import Splitter                from '../../../../src/component/Splitter.mjs';

/**
 * @class Portal.view.learn.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.MainContainer'
         * @protected
         */
        className: 'Portal.view.learn.MainContainer',
        /**
         * @member {String[]} cls=['learnneo-maincontainer']
         */
        cls: ['learnneo-maincontainer'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module  : Container,
            cls     : ['sidenav-container'],
            layout  : 'fit',
            minWidth: 350,
            width   : 350,

            items: [{
                module   : ContentTreeList,
                reference: 'tree',
                listeners: {
                    contentChange: 'onContentChange',
                }
            }]
        }, {
            module      : Splitter,
            cls         : ['main-content-splitter'],
            resizeTarget: 'previous',
            size        : 3
        }, {
            module: Container,
            cls   : ['learn-content-container'],

            items: [{
                module   : ContentView,
                reference: 'content',
                listeners: {
                    edit   : 'onContentEdit',
                    refresh: 'onContentRefresh'
                }
            }]
        }, {
            module: Splitter,
            cls   : ['main-content-splitter'],
            size  : 3
        }, {
            module: PageSectionsPanel,
            width : 350
        }],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Neo.model.Component} model=MainContainerModel
         */
        model: MainContainerModel
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
