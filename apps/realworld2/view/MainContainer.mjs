import FooterComponent         from './FooterComponent.mjs';
import GalleryContainer        from './article/GalleryContainer.mjs';
import HeaderToolbar           from './HeaderToolbar.mjs';
import HelixContainer          from './article/HelixContainer.mjs';
import HomeContainer           from './HomeContainer.mjs';
import MainContainerController from './MainContainerController.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class RealWorld2.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.MainContainer'
         * @protected
         */
        className: 'RealWorld2.view.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         * @protected
         */
        autoMount: true,
        /**
         * @member {String[]} cls=['rw2-home-container']
         */
        cls: ['rw2-main-container', 'neo-viewport'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {
            ntype: 'vbox',
            align: 'stretch'
        },
        /**
         * @member {Array} items
         */
        items: [{
            module: HeaderToolbar
        }, {
            ntype    : 'container',
            flex     : 1,
            items    : [],
            layout   : {ntype: 'card', activeIndex: null},
            reference: 'cards'
        }, {
            module: FooterComponent
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
