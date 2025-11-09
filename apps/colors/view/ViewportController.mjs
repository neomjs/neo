import Controller from '../../../src/controller/Component.mjs';

/**
 * @summary The main controller for the Colors demo application.
 * @description This controller orchestrates the entire Colors application, managing the dashboard widgets (grid, pie chart, bar chart),
 * handling real-time data updates, and demonstrating some of Neo.mjs's most advanced features.
 * It serves as a central hub for state management, cross-window communication, and the seamless drag-to-popup functionality.
 * This class is a key example of how to build a complex, interactive, and multi-window application.
 * @class Colors.view.ViewportController
 * @extends Neo.controller.Component
 * @see Neo.draggable.container.SortZone
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='Colors.view.ViewportController'
         * @protected
         */
        className: 'Colors.view.ViewportController'
    }

    /**
     * @summary Tracks the names of widgets currently open in separate windows.
     * @member {String[]} connectedApps=[]
     */
    connectedApps = []
    /**
     * @summary The ID for the `setInterval` used for real-time data updates.
     * @member {Number|null} intervalId
     */
    intervalId = null
    /**
     * @summary A private flag to track if a drag operation is in the process of moving a widget to a new window.
     * @member {Boolean} #isWindowDragging=false
     * @private
     */
    #isWindowDragging = false
    /**
     * @summary A map to get the original index of a widget in the dashboard's items array.
     * @description This is used to correctly re-insert a widget when its popup window is closed.
     * @member {Object} widgetIndexMap
     */
    widgetIndexMap = {
        'bar-chart': 2,
        'pie-chart': 1,
        grid       : 0
    }

    /**
     * @summary Factory method to open a widget in a new browser window or popup.
     * @description Determines whether to open a full browser window or a frameless popup based on the
     * `openWidgetsAsPopups` state. It calculates the correct URL and window features.
     * @param {String} name The reference name of the widget to open (e.g., 'grid').
     */
    async createBrowserWindow(name) {
        if (this.getStateProvider().getData('openWidgetsAsPopups')) {
            let widget = this.getReference(name),
                rect   = await this.component.getDomRect(widget.vdom.id); // using the vdom id to always get the top-level node

            await this.#openWidgetInPopup(name, rect)
        } else {
            let {config, windowConfigs} = Neo,
                {environment}           = config,
                firstWindowId           = parseInt(Object.keys(windowConfigs)[0]),
                {basePath}              = windowConfigs[firstWindowId],
                url;

            if (environment !== 'development') {
                basePath = `${basePath + environment}/`
            }

            url = `${basePath}apps/colors/childapps/widget/index.html?name=${name}`;

            await Neo.Main.windowOpen({url, windowName: '_blank'})
        }
    }

    /**
     * @summary Cleans up the real-time update interval when the controller is destroyed.
     * @param args
     */
    destroy(...args) {
        this.intervalId && clearInterval(this.intervalId);
        super.destroy(...args)
    }

    /**
     * @summary Handles the `connect` event fired by `Neo.currentWorker`.
     * @description This is triggered when a new child application (a detached widget window) connects to the shared worker.
     * It re-parents the widget component from the main app's component tree into the new child app's viewport.
     * @param {Object} data The event data from the worker.
     * @param {String} data.appName The name of the connecting application.
     * @param {Number} data.windowId The ID of the new window.
     */
    async onAppConnect(data) {
        if (data.appName === 'ColorsWidget') {
            let me           = this,
                app          = Neo.apps[data.appName],
                mainView     = app.mainView,
                {windowId}   = data,
                url          = await Neo.Main.getByPath({path: 'document.URL', windowId}),
                widgetName   = new URL(url).searchParams.get('name'),
                widget       = me.getReference(widgetName),
                parent       = widget.up('panel');

            if (!me.#isWindowDragging) {
                parent.hide()
            }

            me.connectedApps.push(widgetName);

            me.getReference(`detach-${widgetName}-button`).disabled = true;

            mainView.add(widget)
        }
    }

    /**
     * @summary Handles the `disconnect` event fired by `Neo.currentWorker`.
     * @description This is triggered when a child application window is closed. It moves the widget component
     * back into its original position in the main application's dashboard.
     * @param {Object} data The event data from the worker.
     * @param {String} data.appName The name of the disconnecting application.
     * @param {Number} data.windowId The ID of the closed window.
     */
    async onAppDisconnect(data) {
        let me = this;

        if (me.#isWindowDragging) {
            me.#isWindowDragging = false;
            return
        }

        let {appName, windowId} = data,
            dashboard           = me.getReference('dashboard'),
            url                 = await Neo.Main.getByPath({path: 'document.URL', windowId}),
            widgetName          = new URL(url).searchParams.get('name'),
            widget              = me.getReference(widgetName);

        // Closing a non-main app needs to move the widget back into its original position & re-enable the show button
        if (appName === 'ColorsWidget') {
            let itemPanel     = dashboard.items[me.widgetIndexMap[widgetName]],
                bodyContainer = itemPanel.getReference('bodyContainer');

            bodyContainer.add(widget);
            itemPanel.show(true);

            me.getReference(`detach-${widgetName}-button`).disabled = false
        }
        // Close popup windows when closing or reloading the main window
        else if (appName === 'Colors') {
            Neo.Main.windowClose({names: me.connectedApps, windowId})
        }
    }

    /**
     * @summary Handles the change event from the 'Amount of Colors' slider.
     * @param {Object} data The event data.
     */
    onChangeAmountColors(data) {
        this.updateDataProperty(data, 'amountColors',  data.value)
    }

    /**
     * @summary Handles the change event from the 'Amount of Columns' radiofield.
     * @param {Object} data The event data.
     */
    onChangeAmountColumns(data) {
        this.updateDataProperty(data, 'amountColumns',  parseInt(data.value.name))
    }

    /**
     * @summary Handles the change event from the 'Amount of Rows' radiofield.
     * @param {Object} data The event data.
     */
    onChangeAmountRows(data) {
        this.updateDataProperty(data, 'amountRows',  parseInt(data.value.name))
    }

    /**
     * @summary Handles the change event from the 'Open widgets as Popups' checkbox.
     * @param {Object} data The event data.
     */
    onChangeOpenWidgetsAsPopups(data) {
        this.setState('openWidgetsAsPopups', data.value)
    }

    /**
     * @summary Lifecycle method, called after the controller's constructor.
     * @description Sets up listeners for the shared worker's connect and disconnect events.
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
     * @summary Lifecycle method, called after the controller's component is constructed.
     * @description Triggers the initial data load for the widgets.
     */
    onComponentConstructed() {
        super.onComponentConstructed();
        this.updateWidgets()
    }

    /**
     * @summary Handles the click event for the 'Detach Bar Chart' button.
     * @param {Object} data The event data.
     */
    async onDetachBarChartButtonClick(data) {
        await this.createBrowserWindow('bar-chart')
    }

    /**
     * @summary Handles the click event for the 'Detach Grid' button.
     * @param {Object} data The event data.
     */
    async onDetachGridButtonClick(data) {
        await this.createBrowserWindow('grid')
    }

    /**
     * @summary Handles the click event for the 'Detach Pie Chart' button.
     * @param {Object} data The event data.
     */
    async onDetachPieChartButtonClick(data) {
        await this.createBrowserWindow('pie-chart')
    }

    /**
     * @summary Handles the `dragBoundaryEntry` event from the `SortZone`.
     * @description This is the core of the drag-to-re-dock feature. When a dragged window re-enters the main
     * application's boundary, this method closes the popup window and re-inserts the widget component
     * back into its original dashboard container, providing a seamless user experience.
     * @param {Object} data The event data from the SortZone.
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
     * @summary Handles the `dragBoundaryExit` event from the `SortZone`.
     * @description This is the core of the drag-to-popup feature. When a dragged component's proxy leaves
     * the boundary of its container, this method orchestrates the creation of a new popup window
     * and hands off the drag operation to the main thread's DragDrop addon to drag the OS-level window.
     * @param {Object} data The event data from the SortZone.
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
     * @summary Handles the click event to request Window Management permissions.
     * @description The Window Management API is a new browser feature that allows web apps to control
     * the placement of windows, which is essential for the drag-to-popup feature.
     * @param {Object} data The event data.
     */
    async onEnableWindowManagementClick(data) {
        let me       = this,
            response = await Neo.main.addon.DragDrop.requestWindowManagementPermission(),
            button   = me.getReference('window-management-button');

        if (response.success) {
            button.text = 'W-M enabled';
            button.iconCls = 'fa fa-check-square';
            button.disabled = true;
        } else {
            button.text = 'W-M disabled';
            button.iconCls = 'fa fa-exclamation-triangle';
        }
    }

    /**
     * @summary Starts the real-time data update interval.
     * @param {Object} data The event data.
     */
    onStartButtonClick(data) {
        let me           = this,
            intervalTime = 1000 / 60; // assuming 60 FPS

        me.setState({isUpdating: true});

        if (!me.intervalId) {
            me.intervalId = setInterval(() => {
                me.updateWidgets()
            }, intervalTime)
        }
    }

    /**
     * @summary Stops the real-time data update interval.
     * @param {Object} data The event data.
     */
    onStopButtonClick(data) {
        let me = this;

        me.setState({isUpdating: false});

        if (me.intervalId) {
            clearInterval(me.intervalId);
            me.intervalId = null
        }
    }

    /**
     * @summary Private helper method to open a widget in a new popup window.
     * @description This method calculates the precise screen coordinates for the new window based on the main
     * window's position and the drag proxy's last known rectangle. It then calls the main thread
     * to open the new window with the correct URL and features.
     * @param {String} name The reference name of the widget.
     * @param {Object} rect The DOM rect of the drag proxy.
     * @returns {Promise<Object>} A promise that resolves with the new window's properties.
     * @private
     */
    async #openWidgetInPopup(name, rect) {
        let me                      = this,
            {windowId}              = me,
            {config, windowConfigs} = Neo,
            {environment}           = config,
            firstWindowId           = parseInt(Object.keys(windowConfigs)[0]),
            {basePath}              = windowConfigs[firstWindowId],
            url;

        if (environment !== 'development') {
            basePath = `${basePath + environment}/`
        }

        url = `${basePath}apps/colors/childapps/widget/index.html?name=${name}`;

        let winData               = await Neo.Main.getWindowData({windowId}),
            {height, width, x, y} = rect,
            popupHeight           = height - 50, // popup header in Chrome
            popupLeft             = x + winData.screenLeft,
            popupTop              = y + (winData.outerHeight - winData.innerHeight + winData.screenTop);

        await Neo.Main.windowOpen({
            url,
            windowFeatures: `height=${popupHeight},left=${popupLeft},top=${popupTop},width=${width}`,
            windowName    : name
        });

        return {popupHeight, popupLeft, popupTop, popupWidth: width, windowName: name}
    }

    /**
     * @summary Updates the chart components with new data.
     * @param {Object} data The data for the charts.
     */
    updateCharts(data) {
        this.getReference('bar-chart').chartData = data;
        this.getReference('pie-chart').chartData = data
    }

    /**
     * @summary A generic handler to update a property in the state provider.
     * @description Also triggers a manual widget update if real-time updates are not currently running.
     * @param {Object} data The change event data.
     * @param {String} name The name of the property to update in the state provider.
     * @param {Number|Object|null} value The new value for the property.
     */
    updateDataProperty(data, name, value) {
        let stateProvider = this.getStateProvider();

        stateProvider.setData(name, value);

        if (data.oldValue !== null && !stateProvider.getData('isUpdating')) {
            this.updateWidgets()
        }
    }

    /**
     * @summary Updates the data grid component with new records.
     * @description Uses `bulkUpdateRecords` for performance if the store already has data, otherwise sets the initial data.
     * @param {Object[]} records The array of new records for the grid.
     */
    updateGrid(records) {
        let grid    = this.getReference('grid'),
            {store} = grid;

        if (store.getCount()) {
            grid.bulkUpdateRecords(records)
        } else {
            // Depending on the delay of the Socket Connection,
            // the next data package could still contain the old settings
            if (this.getStateProvider().getData('amountRows') === records.length) {
                store.data = records
            }
        }
    }

    /**
     * @summary Fetches new data from the backend service and updates all widgets.
     * @description This is the main data refresh method. It reads the current settings from the state provider,
     * and then uses Neo.mjs's RPC layer to seamlessly call the backend `ColorService.read()` method.
     * This demonstrates remote method access, allowing the App Worker to invoke backend functionality
     * as if it were a local method. After receiving the response, it distributes the new data to the grid and charts.
     */
    async updateWidgets() {
        let me            = this,
            stateProvider = me.getStateProvider(),
            response;

        // Timing issue inside dist/development => the namespace might not be registered yet
        if (!Colors.backend) {
            await me.timeout(50);
            me.updateWidgets()
        } else {
            response = await Colors.backend.ColorService.read({
                amountColors : stateProvider.getData('amountColors'),
                amountColumns: stateProvider.getData('amountColumns'),
                amountRows   : stateProvider.getData('amountRows')
            });

            if (!me.isDestroyed) {
                let {data} = response;

                me.updateGrid(data.tableData);
                me.updateCharts(data.summaryData)
            }
        }
    }
}

export default Neo.setupClass(ViewportController);
