import FooterComponent         from './FooterComponent.mjs';
import HeaderToolbar           from './HeaderToolbar.mjs';
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
         * @private
         */
        className: 'RealWorld2.view.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         * @private
         */
        autoMount: true,
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
            module: HomeContainer,
            flex  : 1
        }, {
            module: FooterComponent
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};