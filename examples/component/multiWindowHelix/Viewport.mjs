import MainContainer      from '../helix/MainContainer.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class Neo.examples.component.multiWindowHelix.Viewport
 * @extends Neo.examples.component.helix.MainContainer
 */
class Viewport extends MainContainer {
    static config = {
        className: 'Neo.examples.component.multiWindowHelix.Viewport',
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onAppConnect(data) {
        console.log('onAppConnect', data);
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onAppDisconnect(data) {
        console.log('onAppDisconnect', data);
    }
    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.currentWorker.on({
            connect   : me.onAppConnect,
            disconnect: me.onAppDisconnect,
            scope     : me
        })
    }
}

Neo.setupClass(Viewport);

export default Viewport;
