import BaseViewport       from '../../../src/container/Viewport.mjs';
import ViewportController from './ViewportController.mjs'

/**
 * @class Neo.examples.model.multiWindow.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.model.multiWindow.Viewport'
         * @protected
         */
        className: 'Neo.examples.model.multiWindow.Viewport',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: ViewportController
    }}
}

Neo.applyClassConfig(Viewport);

export {Viewport as default};