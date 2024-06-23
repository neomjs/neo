import Controller from '../helix/ViewportController.mjs';

/**
 * @class Neo.examples.component.multiWindowHelix.ViewportController
 * @extends Neo.examples.component.helix.ViewportController
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.multiWindowHelix.ViewportController'
         * @protected
         */
        className: 'Neo.examples.component.multiWindowHelix.ViewportController'
    }

    /**
     * @member {String[]} connectedApps=[]
     */
    connectedApps = []

    /**
     *
     */
    async createPopupWindow() {
        let me              = this,
            {windowId}      = me,
            {windowConfigs} = Neo,
            firstWindowId   = parseInt(Object.keys(windowConfigs)[0]),
            {basePath}      = windowConfigs[firstWindowId],
            widget          = me.getReference('controls-panel'),
            winData         = await Neo.Main.getWindowData({windowId}),
            rect            = await me.component.getDomRect(widget.id),
            {height, left, top, width} = rect;

        height -= 62; // popup header in Chrome
        left   += (width + winData.screenLeft);
        top    += (winData.outerHeight - winData.innerHeight + winData.screenTop);

        /*
         * For this demo, the url './childapp/' would be sufficient.
         * However, we also want to open it from within apps/portal.
         *
         * We match the basePath to the firstWindowId,
         * assuming the first connected window is the (main) one which we want to be in charge.
         */
        await Neo.Main.windowOpen({
            url           : basePath + 'examples/component/multiWindowHelix/childapp/',
            windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
            windowId      : firstWindowId,
            windowName    : 'HelixControls'
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onAppConnect(data) {
        let me        = this,
            {appName} = data;

        if (appName === 'HelixControls') {
            let controlsPanel = me.getReference('controls-panel'),
                {mainView}    = Neo.apps[appName];

            me.connectedApps.push(appName);

            controlsPanel.parent.remove(controlsPanel, false);

            this.getReference('header-toolbar').hidden = true;

            mainView.add(controlsPanel)
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onAppDisconnect(data) {
        let me                  = this,
            {appName, windowId} = data;

        if (appName === 'HelixControls') {
            let controlsPanel = me.getReference('controls-panel');

            controlsPanel.parent.remove(controlsPanel, false);

            me.getReference('header-toolbar').hidden = false;

            me.component.add(controlsPanel)
        }
        // Close popup windows when closing or reloading the main window
        else if (appName === 'Neo.examples.component.multiWindowHelix') {
            Neo.Main.windowClose({names: me.connectedApps, windowId})
        }
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
        await this.createPopupWindow()
    }
}

Neo.setupClass(ViewportController);

export default ViewportController;
