import Controller from '../../../src/controller/Component.mjs';

/**
 * @class AgentOS.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        className: 'AgentOS.view.ViewportController'
    }

    /**
     * @member {String[]} connectedApps=[]
     */
    connectedApps = []

    /**
     * @member {Boolean} #isWindowDragging=false
     * @private
     */
    #isWindowDragging = false

    /**
     * @member {Object} widgetIndexMap
     */
    widgetIndexMap = {
        'strategy'    : 0,
        'swarm'       : 1,
        'intervention': 2
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Neo.currentWorker.on({
            connect   : me.onWindowConnect,
            disconnect: me.onWindowDisconnect,
            scope     : me
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onWindowConnect(data) {
        if (data.appName === 'AgentOSWidget' || data.appName === 'AgentSwarm') {
            let me         = this,
                app        = Neo.apps[data.windowId],
                mainView   = app.mainView,
                {windowId} = data,
                url        = await Neo.Main.getByPath({path: 'document.URL', windowId}),
                widgetName = new URL(url).searchParams.get('name'),
                widget     = me.getReference(widgetName),
                parent     = widget.up('panel');

            if (!me.#isWindowDragging) {
                parent.hide()
            }

            me.connectedApps.push(widgetName);

            // Add the widget to the popup window
            mainView.add(widget)
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onWindowDisconnect(data) {
        let me = this;

        if (me.#isWindowDragging) {
            me.#isWindowDragging = false;
                return
        }

        let {appName, windowId} = data;

        if (appName === 'AgentOSWidget' || appName === 'AgentSwarm') {
            let url           = await Neo.Main.getByPath({path: 'document.URL', windowId}),
                dashboard     = me.getReference('dashboard'),
                widgetName    = new URL(url).searchParams.get('name'),
                widget        = me.getReference(widgetName),
                itemPanel     = dashboard.items[me.widgetIndexMap[widgetName]],
                bodyContainer = itemPanel.getReference('bodyContainer');

            bodyContainer.add(widget);
            itemPanel.show();
        } else if (appName === 'AgentOS') {
            Neo.Main.windowClose({names: me.connectedApps, windowId})
        }
    }

    /**
     * @param {Object} data
     */
    async onDragBoundaryEntry(data) {
        let me            = this,
            {windowId}    = me,
            {sortZone}    = data,
            widgetName    = data.draggedItem.reference.replace('-panel', ''),
            widget        = me.getReference(widgetName),
            dashboard     = me.getReference('dashboard'),
            itemPanel     = dashboard.items[me.widgetIndexMap[widgetName]],
            bodyContainer = itemPanel.getReference('bodyContainer');

        await Neo.Main.windowClose({names: widgetName, windowId});

        bodyContainer.add(widget);

        me.#isWindowDragging = false;

        sortZone.isWindowDragging = false;
        sortZone.dragProxy.hidden = false;

        Neo.main.addon.DragDrop.setConfigs({isWindowDragging: false, windowId})
    }

    /**
     * @param {Object} data
     */
    async onDragBoundaryExit(data) {
        let {draggedItem, proxyRect, sortZone} = data,
            widgetName                         = draggedItem.reference.replace('-panel', ''),
            popupData;

        this.#isWindowDragging = true;

        // Prohibit the size reduction inside #openWidgetInPopup().
        proxyRect.height += 50;

        popupData = await this.#openWidgetInPopup(widgetName, proxyRect);

        sortZone.startWindowDrag({
            dragData: data,
            ...popupData
        });
    }

    /**
     * @param {Object} data
     */
    async onOpenSwarmClick(data) {
        let name                    = 'swarm',
            {config, windowConfigs} = Neo,
            {environment}           = config,
            firstWindowId           = Object.keys(windowConfigs)[0],
            {basePath}              = windowConfigs[firstWindowId],
            url;

        if (environment !== 'development') {
            basePath = `${basePath + environment}/`
        }

        url = `${basePath}apps/agentos/childapps/swarm/index.html?name=${name}`;

        await Neo.Main.windowOpen({
            url,
            windowName    : name,
            windowFeatures: 'height=600,width=800,left=50,top=50'
        });
    }

    /**
     * @param {String} name
     * @param {Object} rect
     * @private
     */
    async #openWidgetInPopup(name, rect) {
        let me                      = this,
            {windowId}              = me,
            {config, windowConfigs} = Neo,
            {environment}           = config,
            firstWindowId           = Object.keys(windowConfigs)[0],
            {basePath}              = windowConfigs[firstWindowId],
            url;

        if (environment !== 'development') {
            basePath = `${basePath + environment}/`
        }

        if (name === 'swarm') {
            url = `${basePath}apps/agentos/childapps/swarm/index.html?name=${name}`;
        } else {
            url = `${basePath}apps/agentos/childapps/widget/index.html?name=${name}`;
        }

        let winData               = await Neo.Main.getWindowData({windowId}),
            {height, width, x, y} = rect,
            popupHeight           = height - 50,
            popupLeft             = x + winData.screenLeft,
            popupTop              = y + (winData.outerHeight - winData.innerHeight + winData.screenTop);

        await Neo.Main.windowOpen({
            url,
            windowFeatures: `height=${popupHeight},left=${popupLeft},top=${popupTop},width=${width}`,
            windowName    : name
        });

        return {popupHeight, popupLeft, popupTop, popupWidth: width, windowName: name}
    }
}

export default Neo.setupClass(ViewportController);
