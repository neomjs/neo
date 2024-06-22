import Controller        from '../../../src/controller/Component.mjs';
import {getSearchParams} from '../Util.mjs';

/**
 * @class Portal.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='Portal.view.ViewportController'
         * @protected
         */
        className: 'Portal.view.ViewportController',
        /**
         * @member {String} ntype='viewport-controller'
         * @protected
         */
        ntype: 'viewport-controller',
        /**
         * @member {String|null} defaultHash='/home'
         */
        defaultHash: '/home',
        /**
         * @member {Object} routes
         */
        routes: {
            '/blog'          : 'onBlogRoute',
            '/docs'          : 'onDocsRoute',
            '/home'          : 'onHomeRoute',
            '/learn'         : 'onLearnRoute',
            '/learn/{itemId}': 'onLearnRoute'
        }
    }

    /**
     * @member {String[]} connectedApps=[]
     */
    connectedApps = []

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onAppConnect(data) {
        let {appName, windowId} = data,
            app                 = Neo.apps[appName],
            mainView            = app.mainView;

        if (appName !== 'Portal') {
            let searchString    = await Neo.Main.getByPath({path: 'location.search', windowId}),
                livePreviewId   = getSearchParams(searchString).id,
                livePreview     = Neo.getComponent(livePreviewId),
                sourceContainer = livePreview.getReference('preview'),
                tabContainer    = livePreview.tabContainer,
                sourceView      = sourceContainer.removeAt(0, false);

            livePreview.previewContainer = mainView;
            mainView.add(sourceView);

            tabContainer.activeIndex = 0; // switch to the source view

            tabContainer.getTabAtIndex(1).disabled = true
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onAppDisconnect(data) {
        let me                  = this,
            {appName, windowId} = data,
            app                 = Neo.apps[appName],
            mainView            = app.mainView;

        if (!me.connectedApps.includes(appName)) {
            return
        }

        // Closing a code preview window needs to drop the preview back into the related main app
        if (appName !== 'Portal') {
            let searchString    = await Neo.Main.getByPath({path: 'location.search', windowId}),
                livePreviewId   = getSearchParams(searchString).id,
                livePreview     = Neo.getComponent(livePreviewId),
                sourceContainer = livePreview.getReference('preview'),
                tabContainer    = livePreview.tabContainer,
                sourceView      = mainView.removeAt(0, false);

            livePreview.previewContainer = null;
            sourceContainer.add(sourceView);

            tabContainer.activeIndex = 1; // switch to the source view

            livePreview.getReference('popout-window-button').disabled = false;
            tabContainer.getTabAtIndex(1).disabled = false
        }
        // Close popup windows when closing or reloading the main window
        else {
            Neo.Main.windowClose({names: me.connectedApps, windowId})
        }
    }

    /**
     * @param {Object[]} records
     */
    onBlogPostStoreLoad(records) {
        this.getReference('blog-header-button').badgeText = records.length + ''
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onBlogRoute(params, value, oldValue) {
        this.setMainContentIndex(2)
    }

    /**
     * @param {Object} data
     */
    onBlogSearchFieldChange(data) {
        this.getReference('blog-list').filterItems(data)
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
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onDocsRoute(params, value, oldValue) {
        this.setMainContentIndex(3)
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHomeRoute(params, value, oldValue) {
        this.setMainContentIndex(0)
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onLearnRoute(params, value, oldValue) {
        this.setMainContentIndex(1)
    }

    /**
     * @param {Number} value
     */
    setMainContentIndex(value) {
        this.getReference('main-content').layout.activeIndex = value
    }
}

Neo.setupClass(ViewportController);

export default ViewportController;
