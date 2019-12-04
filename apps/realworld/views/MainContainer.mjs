import FooterComponent         from './FooterComponent.mjs';
import HeaderComponent         from './HeaderComponent.mjs';
import HomeComponent           from './HomeComponent.mjs';
import MainContainerController from './MainContainerController.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class RealWorld.views.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.views.MainContainer'
         * @private
         */
        className: 'RealWorld.views.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Array} cls=[]
         */
        cls: [],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout={ntype: 'vbox'}
         */
        layout: {ntype: 'base'},

        items: [{
            module   : HeaderComponent,
            reference: 'header'
        }, {
            module: FooterComponent
        }]
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        if (!Neo.config.hash) {
            this._items.splice(1, 0, {
                module   : HomeComponent,
                flex     : 1,
                reference: 'home'
            });
        }
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};