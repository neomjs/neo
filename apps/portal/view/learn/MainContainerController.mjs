import Controller from '../../../../src/controller/Component.mjs';

/**
 * @class Portal.view.learn.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.MainContainerController'
         * @protected
         */
        className: 'Portal.view.learn.MainContainerController',
        /**
         * @member {Object} routes
         */
        routes: {
            '/learn/{itemId}': 'onRouteLearnItem'
        }
    }

    /**
     * @member {String[]} connectedApps=[]
     */
    connectedApps = []

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this,
            search, searchString;

        Neo.Main.getByPath({
            path    : 'location.search',
            windowId: me.windowId
        }).then(data => {
            searchString = data?.substr(1) || '';
            search       = searchString ? JSON.parse(`{"${decodeURI(searchString.replace(/&/g, "\",\"").replace(/=/g, "\":\""))}"}`) : {};

            me.getModel().setData({
                deck: search.deck || 'learnneo'
            })
        })
    }

    /**
     * @param {String} searchString
     * @returns {Object}
     */
    decodeUri(searchString) {
        return searchString ? JSON.parse(`{"${decodeURI(searchString.replace(/&/g, "\",\"").replace(/=/g, "\":\""))}"}`) : {}
    }

    /**
     * @param {String} learnItem
     */
    navigateTo(learnItem) {
        Neo.Main.setRoute({
            value   : `/learn/${learnItem}`,
            windowId: this.component.windowId
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onAppConnect(data) {console.log(data);
        let me              = this,
            app             = Neo.apps[data.appName],
            mainView        = app.mainView,
            {windowId}      = data,
            searchString    = await Neo.Main.getByPath({path: 'location.search', windowId}),
            livePreviewId   = me.decodeUri(searchString.substring(1)).id,
            livePreview     = Neo.getComponent(livePreviewId),
            sourceContainer = livePreview.getReference('preview'),
            tabContainer    = livePreview.tabContainer,
            sourceView      = sourceContainer.removeAt(0, false);

        livePreview.previewContainer = mainView;
        mainView.add(sourceView);

        tabContainer.activeIndex = 0; // switch to the source view

        tabContainer.getTabAtIndex(1).disabled = true
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

        // Closing a code preview window needs to drop the preview back into the related main app
        if (appName !== 'Portal') {
            let searchString    = await Neo.Main.getByPath({path: 'location.search', windowId}),
                livePreviewId   = me.decodeUri(searchString.substring(1)).id,
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
            Neo.Main.windowClose({
                names: me.connectedApps,
                windowId
            })
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

        Neo.Main.getByPath({path: 'location.search'})
            .then(data => {
                const search = me.decodeUri(data?.substring(1) || '');
                me.getModel().setData('deck', search.deck || 'learnneo');
            });

        // todo: target file does not exist inside the repo
        /*fetch('../../../../resources/data/deck/EditorConfig.json')
            .then(response => response.json()
                .then(data =>
                    me.getModel().setData('editorConfig', data)
                ))*/
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onContentEdit(data) {
        const vm = this.getModel();
        console.log(data);
        const editorConfig = vm.getData('editorConfig');
        const subDir = vm.getData('deck')
        if (!editorConfig || !subDir) return;

        const filePath = `${editorConfig.root}/${subDir}/pages/${data.record.id}.md`;

        await fetch('http://localhost:3000/openInEditor', {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({path: filePath, editor: editorConfig.editor})
        })
    }

    /**
     * @param {Object} data
     */
    onContentRefresh(data) {
        this.getReference('tree').doFetchContent(data.record)
    }

    /**
     * @param {Object} data
     */
    onIntersect(data) {
        let panel    = this.getReference('page-sections-panel'),
            list     = panel.list,
            recordId = parseInt(data.data.recordId);

        if (!panel.isAnimating) {
            list.selectionModel.select(list.store.get(recordId))
        }
    }

    /**
     * @param {Object} data
     */
    onNextPageButtonClick(data) {
        this.navigateTo(this.getModel().getData('nextPageRecord').id)
    }

    /**
     * @param {Object} data
     */
    onPreviousPageButtonClick(data) {
        this.navigateTo(this.getModel().getData('previousPageRecord').id)
    }

    /**
     * @param {Object} data
     */
    onRouteLearnItem(data) {
        let model = this.getModel(),
            store = model.getStore('contentTree');

        if (store.getCount() > 0) {
            model.data.currentPageRecord = store.get(data.itemId)
        } else {
            store.on({
                load : () => {model.data.currentPageRecord = store.get(data.itemId)},
                delay: 10,
                once : true
            })
        }
    }
}

Neo.setupClass(MainContainerController);

export default MainContainerController;
