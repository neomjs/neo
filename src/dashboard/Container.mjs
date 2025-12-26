import BaseContainer      from '../container/Base.mjs';
import DragProxyContainer from '../draggable/DragProxyContainer.mjs';

/**
 * @class Neo.dashboard.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.Container'
         * @protected
         */
        className: 'Neo.dashboard.Container',
        /**
         * @member {String} ntype='dashboard'
         * @protected
         */
        ntype: 'dashboard',
        /**
         * @member {String[]} baseCls=['neo-dashboard','neo-container']
         * @protected
         */
        baseCls: ['neo-dashboard', 'neo-container'],
        /**
         * @member {Map} detachedItems=new Map()
         * @protected
         */
        detachedItems: new Map(),
        /**
         * @member {Boolean} detachToNewWindow=true
         */
        detachToNewWindow: true,
        /**
         * Add extra CSS selectors to the drag proxy root.
         * @member {String[]} dragProxyExtraCls=[]
         */
        dragProxyExtraCls: [],
        /**
         * @member {Boolean} dragResortable=true
         * @reactive
         */
        dragResortable: true,
        /**
         * @member {Object|null} popupConfig=null
         */
        popupConfig: null,
        /**
         * @member {Function|String|null} popupUrl=null
         */
        popupUrl: null
    }

    /**
     * @member {Boolean} #isReintegrating=false
     * @private
     */
    #isReintegrating = false
    /**
     * @member {Boolean} #isWindowDragging=false
     * @private
     */
    #isWindowDragging = false

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
     * @param {Object} config
     */
    createSortZone(config) {
        let me = this;

        Neo.merge(config, {
            allowOverdrag     : true,
            dragProxyConfig   : {module: DragProxyContainer, ...me.dragProxyConfig},
            dragProxyExtraCls : me.dragProxyExtraCls,
            enableProxyToPopup: me.detachToNewWindow,
            listeners         : {
                dragBoundaryEntry: data => me.onDragBoundaryEntry(data),
                dragBoundaryExit : data => me.onDragBoundaryExit(data),
                dragEnd          : data => me.fire('dragEnd',           data)
            }
        })

        super.createSortZone(config)
    }

    /**
     * @param {Neo.component.Base} item
     * @returns {String}
     */
    getPopupUrl(item) {
        let me  = this,
            url = item.popupUrl || me.popupUrl;

        if (Neo.isFunction(url)) {
            return url(item)
        }

        return url
    }

    /**
     * @returns {Promise<any>}
     */
    loadSortZoneModule() {
        return import('../draggable/dashboard/SortZone.mjs')
    }

    /**
     * @param {Object} data
     */
    async onDragBoundaryEntry(data) {
        let me            = this,
            {windowId}    = me,
            {sortZone}    = data,
            widget        = data.draggedItem,
            widgetName    = widget.reference || widget.id;

        me.#isReintegrating = true;

        sortZone.dragProxy.add(widget, true); // Silent add

        await Neo.Main.windowClose({names: widgetName, windowId});

        me.#isReintegrating  = false;
        me.#isWindowDragging = false;

        sortZone.isWindowDragging = false;
        sortZone.dragProxy.style  = {opacity: 1};

        Neo.main.addon.DragDrop.setConfigs({isWindowDragging: false, windowId});

        me.fire('dragBoundaryEntry', data)
    }

    /**
     * @param {Object} data
     */
    async onDragBoundaryExit(data) {
        let me = this,
            {draggedItem, proxyRect, sortZone} = data,
            widgetName = draggedItem.reference || draggedItem.id,
            popupData;

        me.#isWindowDragging = true;

        // Prohibit the size reduction inside #openWidgetInPopup().
        proxyRect.height += 50; // Adjust for header

        popupData = await me.openWidgetInPopup(draggedItem, proxyRect);

        sortZone.startWindowDrag({
            dragData: data,
            ...popupData
        });

        me.fire('dragBoundaryExit', data)
    }

    /**
     * @param {Neo.component.Base} widget
     * @param {DOMRect} rect
     * @returns {Promise<Object>}
     */
    async openWidgetInPopup(widget, rect) {
        let me                      = this,
            {windowId}              = me,
            {config, windowConfigs} = Neo,
            {environment}           = config,
            firstWindowId           = Object.keys(windowConfigs)[0],
            {basePath}              = windowConfigs[firstWindowId],
            widgetName              = widget.reference || widget.id,
            url                     = me.getPopupUrl(widget);

        if (!url) {
            console.error('No popupUrl defined for dashboard item', widget);
            return
        }

        if (!url.startsWith('http')) {
            if (environment !== 'development' && !url.includes(environment)) {
                 // Adjust logic for production paths if needed, but assuming relative to base
                 // Ideally the provided URL should be correct relative to app base
            }
            url = basePath + url;
        }

        // Append identification params
        url += `${url.includes('?') ? '&' : '?'}name=${widgetName}&dashboardId=${me.id}`;

        let winData               = await Neo.Main.getWindowData({windowId}),
            {height, width, x, y} = rect,
            popupHeight           = height - 50, // popup header adjustment
            popupLeft             = x + winData.screenLeft,
            popupTop              = y + (winData.outerHeight - winData.innerHeight + winData.screenTop),
            windowName            = widgetName;

        me.detachedItems.set(widgetName, {
            index : me.items.indexOf(widget),
            widget: widget
        });

        await Neo.Main.windowOpen({
            url,
            windowId,
            windowFeatures: `height=${popupHeight},left=${popupLeft},top=${popupTop},width=${width}`,
            windowName
        });

        return {popupHeight, popupLeft, popupTop, popupWidth: width, windowName}
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {String} data.windowId
     */
    async onWindowConnect(data) {
        let me         = this,
            app        = Neo.apps[data.windowId],
            mainView   = app.mainView,
            {windowId} = data,
            url        = await Neo.Main.getByPath({path: 'document.URL', windowId}),
            params     = new URL(url).searchParams,
            dashboardId= params.get('dashboardId'),
            widgetName = params.get('name');

        if (dashboardId === me.id) {
            let detachedItem = me.detachedItems.get(widgetName);

            if (detachedItem) {
                detachedItem.windowId = windowId;

                detachedItem.widget.wrapperStyle = {};
                // Add the widget to the popup window
                mainView.add(detachedItem.widget, false, !me.#isWindowDragging)
            }
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {String} data.windowId
     */
    async onWindowDisconnect(data) {
        let me = this;

        if (me.#isWindowDragging || me.#isReintegrating) {
            me.#isWindowDragging = false;
            return
        }

        let {windowId} = data;

        for (const [widgetName, detachedItem] of me.detachedItems.entries()) {
            if (detachedItem.windowId === windowId) {
                let {index, widget} = detachedItem;

                me.insert(index, widget);
                me.detachedItems.delete(widgetName);
                break
            }
        }
    }
}

export default Neo.setupClass(Container);
