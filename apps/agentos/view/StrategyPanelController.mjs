import Controller from '../../../src/controller/Component.mjs';

/**
 * @class AgentOS.view.StrategyPanelController
 * @extends Neo.controller.Component
 */
class StrategyPanelController extends Controller {
    static config = {
        className: 'AgentOS.view.StrategyPanelController'
    }

    /**
     * @member {String[]} connectedWidgets=[]
     */
    connectedWidgets = []
    /**
     * @member {Boolean} #isWindowDragging=false
     * @private
     */
    #isWindowDragging = false
    /**
     * @member {Boolean} #isReintegrating=false
     * @private
     */
    #isReintegrating = false
    /**
     * @member {Object} widgetIndexMap
     */
    widgetIndexMap = {
        'kpi-velocity'    : 0,
        'kpi-active-epics': 1,
        'kpi-uptime'      : 2
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
     */
    async onDragBoundaryEntry(data) {
        let me         = this,
            {windowId} = me,
            {sortZone} = data,
            widgetName = data.draggedItem.reference,
            widget     = me.getReference(widgetName);

        me.#isReintegrating = true;

        sortZone.dragProxy.add(widget, true);

        // Close the popup
        await Neo.Main.windowClose({names: widgetName, windowId});

        me.#isReintegrating = false;
        me.#isWindowDragging = false;

        sortZone.isWindowDragging = false;
        sortZone.dragProxy.style = {opacity: 1};

        Neo.main.addon.DragDrop.setConfigs({isWindowDragging: false, windowId})
    }

    /**
     * @param {Object} data
     */
    async onDragBoundaryExit(data) {
        let {draggedItem, proxyRect, sortZone} = data,
            me         = this,
            widgetName = draggedItem.reference,
            popupData;

        me.draggedItem       = draggedItem;
        me.#isWindowDragging = true;

        popupData = await this.#openWidgetInPopup(widgetName, proxyRect);

        sortZone.startWindowDrag({
            dragData: data,
            ...popupData
        })
    }

    /**
     * @param {Object} data
     */
    onDragEnd(data) {
        let me = this;

        if (me.#isWindowDragging && me.draggedItem) {
            me.getReference('strategy').remove(me.draggedItem, false, false);
            me.draggedItem = null
        }

        me.#isWindowDragging = false
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onWindowConnect(data) {
        if (data.appName === 'AgentOSStrategy') {
            let me         = this,
                app        = Neo.apps[data.windowId],
                mainView   = app.mainView,
                {windowId} = data,
                url        = await Neo.Main.getByPath({path: 'document.URL', windowId}),
                widgetName = new URL(url).searchParams.get('name');

            let widget = me.getReference(widgetName);

            widget.wrapperStyle = {};

            me.connectedWidgets.push(widgetName);

            // Add the widget to the popup window
            mainView.add(widget, false, !me.#isWindowDragging)
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onWindowDisconnect(data) {
        let me = this;

        if (me.#isWindowDragging || me.#isReintegrating) {
            me.#isWindowDragging = false;
            return
        }

        let {appName, windowId} = data;

        if (appName === 'AgentOSStrategy') {
            let url        = await Neo.Main.getByPath({path: 'document.URL', windowId}),
                widgetName = new URL(url).searchParams.get('name');

            let dashboard = me.getReference('strategy'),
                widget    = me.getReference(widgetName);

            dashboard.insert(me.widgetIndexMap[widgetName], widget);

            // Remove from connected list
            let idx = me.connectedWidgets.indexOf(widgetName);
            if (idx > -1) {
                me.connectedWidgets.splice(idx, 1);
            }
        } else if (appName === 'AgentOS') {
            // Main app closing, close all popups
            Neo.Main.windowClose({names: me.connectedWidgets, windowId})
        }
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

        url = `${basePath}apps/agentos/childapps/strategy/index.html?name=${name}`;

        let winData               = await Neo.Main.getWindowData({windowId}),
            {height, width, x, y} = rect,
            popupHeight           = Math.round(height),
            popupLeft             = Math.round(x + winData.screenLeft),
            popupTop              = Math.round(y + (winData.outerHeight - winData.innerHeight + winData.screenTop)),
            popupWidth            = Math.round(width);

        await Neo.Main.windowOpen({
            url,
            windowId,
            windowFeatures: `height=${popupHeight},left=${popupLeft},top=${popupTop},width=${popupWidth}`,
            windowName    : name
        });

        return {popupHeight, popupLeft, popupTop, popupWidth: width, windowName: name}
    }
}

export default Neo.setupClass(StrategyPanelController);
