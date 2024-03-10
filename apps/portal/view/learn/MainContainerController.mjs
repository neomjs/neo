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
        className: 'Portal.view.learn.MainContainerController'
    }

    /**
     * @member {String[]} connectedApps=[]
     */
    connectedApps = []

    /**
     * @param {String} searchString
     * @returns {Object}
     */
    decodeUri(searchString) {
        return searchString ? JSON.parse(`{"${decodeURI(searchString.replace(/&/g, "\",\"").replace(/=/g, "\":\""))}"}`) : {}
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     */
    async onAppConnect(data) {
        let me              = this,
            app             = Neo.apps[data.appName],
            mainView        = app.mainView,
            windowId        = mainView.windowId,
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
     */
    async onAppDisconnect(data) {
        let me              = this,
            app             = Neo.apps[data.appName],
            mainView        = app.mainView,
            windowId        = mainView.windowId,
            searchString    = await Neo.Main.getByPath({path: 'location.search', windowId}),
            livePreviewId   = me.decodeUri(searchString.substring(1)).id,
            livePreview     = Neo.getComponent(livePreviewId),
            sourceContainer = livePreview.getReference('preview'),
            tabContainer    = livePreview.tabContainer,
            sourceView      = mainView.removeAt(0, false);

        console.log(data, me.connectedApps);

        livePreview.previewContainer = null;
        sourceContainer.add(sourceView);

        tabContainer.activeIndex = 1; // switch to the source view

        livePreview.getReference('popout-window-button').disabled = false;
        tabContainer.getTabAtIndex(1).disabled = false;

        /*Neo.Main.windowClose({
            names: me.connectedApps
        })*/
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

        fetch('../../../../resources/data/deck/EditorConfig.json')
            .then(response => response.json()
                .then(data =>
                    me.getModel().setData('editorConfig', data)
                ))
    }

    /**
     * @param {Object} data
     */
    onContentChange(data) {
        let content = this.getReference('content');

        content.toggleCls('lab', data.isLab);

        content.html   = data.html;
        content.record = data.record;
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

        const filePath = `${editorConfig.root}/${subDir}/p/${data.record.id}.md`;

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

    onIntersect(data) {
        console.log('onIntersect', data);

        let me    = this,
            panel = me.getReference('page-sections-panel'),
            list  = panel.list,
            recordId = parseInt(data.targetId.split('__')[2]);

        console.log(list.store);
        console.log(recordId)

        list.selectionModel.select(list.store.get(recordId));
    }
}

Neo.setupClass(MainContainerController);

export default MainContainerController;
