import Controller from '../coronaGallery/ViewportController.mjs';

/**
 * @class Neo.examples.component.multiWindowCoronaGallery.ViewportController
 * @extends Neo.examples.component.coronaGallery.ViewportController
 * @summary Synchronizes detached controls window lifecycle and theme changes across SharedWorker windows.
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
            firstWindowId              = Object.keys(windowConfigs)[0],
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
            let {mainView} = Neo.apps[data.windowId];

            me.connectedApps.push(appName);

            if (mainView.theme !== me.component.theme) {
                mainView.theme = me.component.theme
            }

            me.observeConfig(mainView, 'theme', theme => {
                if (!me.component.isDestroyed && me.component.theme !== theme) {
                    me.component.theme = theme
                }
            });

            me.getReference('maximise-button').hidden = true;

            mainView.add(me.getReference('controls-panel'))
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
            me.component.add(me.getReference('controls-panel'));
            me.getReference('maximise-button').hidden = false
        }
        // Close popup windows when closing or reloading the main window
        else if (appName === 'Neo.examples.component.multiWindowCoronaGallery') {
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
        });

        me.observeConfig(me.component, 'theme', theme => {
            for (const app of Object.values(Neo.apps || {})) {
                const otherView = app?.mainView;

                if (otherView && !otherView.isDestroyed && otherView !== me.component && otherView.theme !== theme) {
                    otherView.theme = theme
                }
            }
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
