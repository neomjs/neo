import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Colors.view.ViewportController
 * @extends Neo.controller.Component
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
     * @member {String[]} connectedApps=[]
     */
    connectedApps = []
    /**
     * @member {Number|null} intervalId
     */
    intervalId = null
    /**
     * @member {Boolean} #isWindowDragging=false
     */
    #isWindowDragging = false
    /**
     * @member {Object} widgetIndexMap
     */
    widgetIndexMap = {
        'bar-chart': 2,
        'pie-chart': 1,
        grid       : 0
    }

    /**
     * @param {String} name The name of the reference
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
     * @param args
     */
    destroy(...args) {
        this.intervalId && clearInterval(this.intervalId);
        super.destroy(...args)
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
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
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
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
     * @param {Object} data
     */
    onChangeAmountColors(data) {
        this.updateDataProperty(data, 'amountColors',  data.value)
    }

    /**
     * @param {Object} data
     */
    onChangeAmountColumns(data) {
        this.updateDataProperty(data, 'amountColumns',  parseInt(data.value.name))
    }

    /**
     * @param {Object} data
     */
    onChangeAmountRows(data) {
        this.updateDataProperty(data, 'amountRows',  parseInt(data.value.name))
    }

    /**
     * @param {Object} data
     */
    onChangeOpenWidgetsAsPopups(data) {
        this.setState('openWidgetsAsPopups', data.value)
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
     *
     */
    onComponentConstructed() {
        super.onComponentConstructed();
        this.updateWidgets()
    }

    /**
     * @param {Object} data
     */
    async onDetachBarChartButtonClick(data) {
        await this.createBrowserWindow('bar-chart')
    }

    /**
     * @param {Object} data
     */
    async onDetachGridButtonClick(data) {
        await this.createBrowserWindow('grid')
    }

    /**
     * @param {Object} data
     */
    async onDetachPieChartButtonClick(data) {
        await this.createBrowserWindow('pie-chart')
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
     * @param {Object} data
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
     * @param {Object} data
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
     * @param {String} name
     * @param {Object} rect
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
     * @param {Object} data
     */
    updateCharts(data) {
        this.getReference('bar-chart').chartData = data;
        this.getReference('pie-chart').chartData = data
    }

    /**
     * If the WebSocket stream is not running, we need to pull new data once to see the new setting visually
     * @param {Object} data The change event data
     * @param {String} name The VM data property name
     * @param {Number|Object|null} value The new VM data property value
     */
    updateDataProperty(data, name, value) {
        let stateProvider = this.getStateProvider();

        stateProvider.setData(name, value);

        if (data.oldValue !== null && !stateProvider.getData('isUpdating')) {
            this.updateWidgets()
        }
    }

    /**
     * @param {Object[]} records
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
     *
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
