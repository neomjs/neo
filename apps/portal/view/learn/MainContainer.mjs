import Container               from '../../../../src/container/Base.mjs';
import ContentTreeList         from './ContentTreeList.mjs';
import MainContainerController from './MainContainerController.mjs';
import MainContainerModel      from './MainContainerModel.mjs';
import PageContainer           from './PageContainer.mjs';
import PageSectionsContainer   from './PageSectionsContainer.mjs';
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
            bind    : {hidden: data => data.size === 'x-small'},
            cls     : ['sidenav-container'],
            layout  : 'fit',
            minWidth: 350,
            width   : 350,

            items: [{
                module   : ContentTreeList,
                reference: 'tree'
            }]
        }, {
            module      : Splitter,
            bind        : {hidden: data => data.size === 'x-small'},
            cls         : ['main-content-splitter'],
            resizeTarget: 'previous',
            size        : 3
        }, {
            module: PageContainer
        }, {
            module   : PageSectionsContainer,
            bind     : {hidden: data => data.size !== 'large'},
            reference: 'page-sections-container',
            width    : 250
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
