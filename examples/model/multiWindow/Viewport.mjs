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
         * @member {Boolean} autoMount=false
         */
        autoMount: false,
        /**
         * @member {Boolean} autoRender=false
         */
        autoRender: false,
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {Object} style
         */
        style: {
            padding: '20px'
        }
    }}
}

Neo.applyClassConfig(Viewport);

export {Viewport as default};