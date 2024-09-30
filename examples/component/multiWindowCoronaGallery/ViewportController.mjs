import Controller from '../coronaGallery/ViewportController.mjs';

/**
 * @class Neo.examples.component.multiWindowCoronaGallery.ViewportController
 * @extends Neo.examples.component.coronaGallery.ViewportController
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.multiWindowCoronaGallery.ViewportController'
         * @protected
         */
        className: 'Neo.examples.component.multiWindowCoronaGallery.ViewportController'
    }

    /**
     * @member {String[]} connectedApps=[]
     */
    connectedApps = []

    /**
     *
     */
    async createPopupWindow() {
        let me                         = this,
            {windowId}                 = me,
            {config, windowConfigs}    = Neo,
            {environment}              = config,
            firstWindowId              = parseInt(Object.keys(windowConfigs)[0]),
            {basePath}                 = windowConfigs[firstWindowId],
            widget                     = me.getReference('controls-panel'),
            winData                    = await Neo.Main.getWindowData({windowId}),
            rect                       = await me.component.getDomRect(widget.id),
            {height, left, top, width} = rect;

        if (environment !== 'development') {
            basePath = `${basePath + environment}/`
        }

        height += 1; // popup header in Chrome => height + 1, top -63
        left   += (width + winData.screenLeft);
        top    += (winData.outerHeight - winData.innerHeight + winData.screenTop - 63);

        // Mounted inside a code.LivePreview, the popup header should be within the content (height-wise)
        // See: https://github.com/neomjs/neo/issues/5991
        if (me.component.up('live-preview')) {
            height -= 63;
            top    += 63;
        }

        /*
         * For this demo, the url './childapp/' would be sufficient.
         * However, we also want to open it from within apps/portal.
         *
         * We match the basePath to the firstWindowId,
         * assuming the first connected window is the (main) one which we want to be in charge.
         */
        await Neo.Main.windowOpen({
            url           : basePath + 'examples/component/multiWindowCoronaGallery/childapp/',
            windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
            windowId      : firstWindowId,
            windowName    : 'GalleryControls'
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

        if (appName === 'GalleryControls') {
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

        if (appName === 'GalleryControls') {
            let controlsPanel = me.getReference('controls-panel');

            controlsPanel.parent.remove(controlsPanel, false);

            me.getReference('header-toolbar').hidden = false;

            me.component.add(controlsPanel)
        }
        // Close popup windows when closing or reloading the main window
        else if (appName === 'Neo.examples.component.multiWindowCoronaGallery') {console.log('close', me.connectedApps);
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

export default Neo.setupClass(ViewportController);
