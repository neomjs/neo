import Container               from '../../../../src/container/Base.mjs';
import ContentTreeList         from './ContentTreeList.mjs';
import MainContainerController from './MainContainerController.mjs';
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
            module: Container,
            layout: 'fit',
            width : 350,

            items: [{
                module   : ContentTreeList,
                listeners: {leafItemClick: 'onContentListLeafClick'}
            }]
        }, {
            module      : Splitter,
            resizeTarget: 'previous'
        }, {
            module   : Container,
            layout   : {ntype: 'card', activeIndex: null},
            reference: 'content-container'
        }],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
