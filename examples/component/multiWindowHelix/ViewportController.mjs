import Component from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.component.multiWindowHelix.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.multiWindowHelix.ViewportController'
         * @protected
         */
        className: 'Neo.examples.component.multiWindowHelix.ViewportController'
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

Neo.setupClass(ViewportController);

export default ViewportController;
