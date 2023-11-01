import Container from '../../../../src/container/Base.mjs';
import Component from '../../../../src/component/Base.mjs';
import ContentTreeList from './ContentTreeList.mjs';
import MainContainerController from './MainContainerController.mjs';
import MainContainerModel from './MainContainerModel.mjs';
import Splitter from '../../../../src/component/Splitter.mjs';

class MainContainer extends Container {
    static config = {
        className: 'LearnNeo.view.home.MainContainer',
        model: MainContainerModel,
        controller: MainContainerController,
        items: [{
            module: Container,
            layout: 'fit',
            minWidth: 350,
            width: 350,

            items: [{
                module: ContentTreeList,
                reference: 'tree',
                listeners: {contentChange: 'onContentListLeafClick'},
            }]
        }, {
            module: Splitter,
            resizeTarget: 'previous'
        }, {
            module: Component,
            layout: {ntype: 'card', activeIndex: null},
            cls: 'learn-content',
            reference: 'content'
        }],
        layout: {ntype: 'hbox', align: 'stretch'}
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
