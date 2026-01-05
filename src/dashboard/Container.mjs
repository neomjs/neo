import BaseContainer      from '../container/Base.mjs';
import DragProxyContainer from '../draggable/DragProxyContainer.mjs';

/**
 * @summary A container that manages a dynamic layout of sortable items, with built-in support for detaching items into separate browser windows.
 *
 * This class extends `Neo.container.Base` to provide a drag-and-drop dashboard experience. Its most powerful feature is the
 * **"Detach to Window"** capability. When a user drags a dashboard item outside the container's boundary, this class automatically:
 * 1.  Opens a new browser popup window (app shell) based on the item's or container's `popupUrl`.
 * 2.  Moves the item's component instance into the new window's component tree.
 * 3.  Maintains a link between the detached item and its original dashboard slot.
 *
 * **Re-integration:**
 * If the user drags the detached window back over the original dashboard, this class detects the re-entry, closes the popup,
 * and seamlessly re-inserts the item into its previous position (or a new sort index).
 *
 * **Architecture:**
 * This class leverages the `Neo.worker.App`'s shared nature. It listens for global `connect` and `disconnect` events to track
 * the lifecycle of detached windows. It uses a robust `windowId` mapping to ensure that even if a window is closed manually by the user,
 * the widget is correctly reclaimed and restored to the dashboard, preventing data loss or "zombie" widgets.
 *
 * @class Neo.dashboard.Container
 * @extends Neo.container.Base
 * @see Neo.dashboard.Panel
 * @see Neo.draggable.container.SortZone
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
        popupUrl: null,
        /**
         * @member {String|null} sortGroup=null
         */
        sortGroup: null
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

        me.detachedItems = new Map();

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
            },
            sortGroup: me.sortGroup
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

        console.log('onDragBoundaryEntry', me.id, widget);

        sortZone.dragProxy.add(widget, true); // Silent add

        me.detachedItems.delete(widgetName);

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
        let me              = this,
            {windowId}      = me,
            {windowConfigs} = Neo,
            firstWindowId   = Object.keys(windowConfigs)[0],
            {basePath}      = windowConfigs[firstWindowId],
            widgetName      = widget.reference || widget.id,
            url             = me.getPopupUrl(widget);

        if (!url) {
            console.error('No popupUrl defined for dashboard item', widget);
            return
        }

        if (!url.startsWith('http')) {
            url = basePath + url
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
                console.log('onWindowDisconnect: Re-integrating widget', me.id, widgetName);
                let {index, widget} = detachedItem;

                me.insert(index, widget);
                me.detachedItems.delete(widgetName);
                break
            }
        }
    }

    /**
     * Re-opens the popup window and resumes the window drag operation.
     * Called by the DragCoordinator when a remote drag leaves a target dashboard back into the void.
     * @param {String} widgetName
     * @param {DOMRect} proxyRect
     */
    async resumeWindowDrag(widgetName, proxyRect) {
        let me           = this,
            detachedItem = me.detachedItems.get(widgetName),
            popupData;

        if (detachedItem) {
            me.#isWindowDragging = true;

            popupData = await me.openWidgetInPopup(detachedItem.widget, proxyRect);

            // We need to tell the DragDrop addon to resume window dragging
            Neo.main.addon.DragDrop.startWindowDrag({
                popupHeight: popupData.popupHeight,
                popupName  : popupData.windowName,
                popupWidth : popupData.popupWidth,
                windowId   : me.windowId
            });
        }
    }

    /**
     * Closes the popup window and suspends the window drag operation.
     * Called by the DragCoordinator when a remote drag enters a target dashboard.
     * @param {String} widgetName
     */
    async suspendWindowDrag(widgetName) {
        let me = this;

        // Prevent onWindowDisconnect from auto-reintegrating
        me.#isWindowDragging = true;

        // Break the parent chain to prevent circular config lookups during handover
        let detachedItem = me.detachedItems.get(widgetName);

        console.log('suspendWindowDrag', me.id, widgetName, detachedItem);

        if (detachedItem?.widget) {
            detachedItem.widget.parentId = null
        }

        await Neo.Main.windowClose({names: [widgetName], windowId: me.windowId});

        Neo.main.addon.DragDrop.setConfigs({isWindowDragging: false, windowId: me.windowId})
    }
}

export default Neo.setupClass(Container);
