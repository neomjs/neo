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
     * @member {Object} widgetIndexMap
     */
    widgetIndexMap = {
        'bar-chart': 3,
        'pie-chart': 2,
        table      : 1
    }

    /**
     * @param {String} name The name of the reference
     */
    async createBrowserWindow(name) {
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

        if (me.getStateProvider().getData('openWidgetsAsPopups')) {
            let widget                     = me.getReference(name),
                winData                    = await Neo.Main.getWindowData({windowId} ),
                rect                       = await me.component.getDomRect(widget.vdom.id), // using the vdom id to always get the top-level node
                {height, left, top, width} = rect;

            height -= 50; // popup header in Chrome
            left   += winData.screenLeft;
            top    += (winData.outerHeight - winData.innerHeight + winData.screenTop);

            await Neo.Main.windowOpen({
                url,
                windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
                windowName    : name
            })
        } else {
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
                widgetParent = widget.up();

            me.connectedApps.push(widgetName);

            me.getReference(`detach-${widgetName}-button`).disabled = true;

            widgetParent.remove(widget, false);
            mainView.add(widget)
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
            url                 = await Neo.Main.getByPath({path: 'document.URL', windowId}),
            widgetName          = new URL(url).searchParams.get('name'),
            widget              = me.getReference(widgetName),
            widgetParent        = widget.up();

        // Closing a non-main app needs to move the widget back into its original position & re-enable the show button
        if (appName === 'ColorsWidget') {
            widgetParent.remove(widget, false);
            me.component.insert(me.widgetIndexMap[widgetName], widget);

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
    async onDetachPieChartButtonClick(data) {
        await this.createBrowserWindow('pie-chart')
    }

    /**
     * @param {Object} data
     */
    async onDetachTableButtonClick(data) {
        await this.createBrowserWindow('table')
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
    updateTable(records) {
        let table   = this.getReference('table'),
            {store} = table;

        if (store.getCount()) {
            table.bulkUpdateRecords(records)
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
    updateWidgets() {
        let me            = this,
            stateProvider = me.getStateProvider();

        Colors.backend.ColorService.read({
            amountColors : stateProvider.getData('amountColors'),
            amountColumns: stateProvider.getData('amountColumns'),
            amountRows   : stateProvider.getData('amountRows')
        }).then(response => {
            if (!me.isDestroyed) {
                let {data} = response;

                me.updateTable(data.tableData);
                me.updateCharts(data.summaryData)
            }
        })
    }
}

export default Neo.setupClass(ViewportController);
