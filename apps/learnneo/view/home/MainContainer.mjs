import Container               from '../../../../src/container/Base.mjs';
import ContentView             from './ContentView.mjs';
import ContentTreeList         from './ContentTreeList.mjs';
import MainContainerController from './MainContainerController.mjs';
import MainContainerModel      from './MainContainerModel.mjs';
import Splitter                from '../../../../src/component/Splitter.mjs';

/**
 * @class LearnNeo.view.home.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        /**
         * @member {String} className='LearnNeo.view.home.MainContainer'
         * @protected
         */
        className: 'LearnNeo.view.home.MainContainer',
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module  : Container,
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
            resizeTarget: 'previous',
            size        : 5
        }, {
            module   : ContentView,
            reference: 'content',
            listeners: {
                edit   : 'onContentEdit',
                refresh: 'onContentRefresh'
            }
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

Neo.applyClassConfig(MainContainer);

export default MainContainer;
