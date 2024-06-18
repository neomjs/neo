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
     *
     */
    async createPopupWindow() {
        let me  = this,
            url = './childapp/index.html';

            let widget                     = me.getReference('controls-panel'),
                winData                    = await Neo.Main.getWindowData(),
                rect                       = await me.component.getDomRect(widget.id),
                {height, left, top, width} = rect;

            height -= 62; // popup header in Chrome
            left   += (width + winData.screenLeft);
            top    += (winData.outerHeight - winData.innerHeight + winData.screenTop);

            await Neo.Main.windowOpen({
                url,
                windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
                windowName    : 'HelixControls'
            })
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

    /**
     * @param {Object} data
     */
    async onMaximiseButtonClick(data) {
        console.log(data.component.appName);
        await this.createPopupWindow()
    }
}

Neo.setupClass(ViewportController);

export default ViewportController;
