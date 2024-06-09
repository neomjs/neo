import Component from '../../../src/controller/Component.mjs';

/**
 * @class Colors.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Component {
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
        'pie-chart': 2,
        table      : 1
    }

    /**
     @param {Neo.component.Base} widget
     @param {String} name
     */
    async createPopupWindow(widget, name) {
        let me                         = this,
            winData                    = await Neo.Main.getWindowData(),
            rect                       = await me.component.getDomRect(widget.id),
            {height, left, top, width} = rect;

        height -= 50; // popup header in Chrome
        left   += winData.screenLeft;
        top    += (winData.outerHeight - winData.innerHeight + winData.screenTop);

        Neo.Main.windowOpen({
            url           : `./childapps/widget/index.html?name=${name}`,
            windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
            windowName    : name
        })
    }

    /**
     * @returns {Object[]}
     */
    generateData() {
        let me   = this,
            data = [],
            i    = 0,
            len  = 20;

        for (; i < len; i++) {
            data.push({
                id     : `row${i + 1}`,
                columnA: me.getRandomInteger(),
                columnB: me.getRandomInteger(),
                columnC: me.getRandomInteger(),
                columnD: me.getRandomInteger(),
                columnE: me.getRandomInteger(),
                columnF: me.getRandomInteger(),
                columnG: me.getRandomInteger(),
                columnH: me.getRandomInteger(),
                columnI: me.getRandomInteger(),
                columnJ: me.getRandomInteger()
            })
        }

        return data
    }

    /**
     * @returns {Number}
     */
    getRandomInteger() {
        return Math.floor(Math.random() * 5) + 1
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onAppConnect(data) {
        if (data.appName !== 'Colors') {
            let me           = this,
                app          = Neo.apps[data.appName],
                mainView     = app.mainView,
                {windowId}   = data,
                url          = await Neo.Main.getByPath({path: 'document.URL', windowId}),
                widgetName   = new URL(url).searchParams.get('name'),
                widget       = me.getReference(widgetName),
                widgetParent = widget.up();

            me.connectedApps.push(widgetName);

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
            app                 = Neo.apps[appName],
            url                 = await Neo.Main.getByPath({path: 'document.URL', windowId}),
            widgetName          = new URL(url).searchParams.get('name'),
            mainView            = app.mainView,
            widget;

        // Closing a code preview window needs to drop the preview back into the related main app
        if (appName !== 'Colors') {
            widget = mainView.removeAt(0, false);

            me.component.insert(me.widgetIndexMap[widgetName], widget);

            me.getReference(`detach-${widgetName}-button`).disabled = false
        }
        // Close popup windows when closing or reloading the main window
        else {
            Neo.Main.windowClose({names: me.connectedApps, windowId})
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
        })
    }

    /**
     *
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        let me   = this,
            data = me.generateData();

        me.getStore('colors').data = data;
        me.updatePieChart(data)
    }

    /**
     * @param {Object} data
     */
    async onDetachTableButtonClick(data) {
        data.component.disabled = true;
        await this.createPopupWindow(this.getReference('table'), 'table')
    }

    /**
     * @param {Object} data
     */
    onStopButtonClick(data) {
        let me = this;

        if (me.intervalId) {
            clearInterval(me.intervalId);
            me.intervalId = null
        }
    }

    /**
     * @param {Object} data
     */
    onStartButtonClick(data) {
        let me           = this,
            intervalTime = 1000 / 60, // assuming 60 FPS
            store        = me.getStore('colors'),
            table        = me.getReference('table'),
            tableView    = table.view;

        if (!me.intervalId) {
            me.intervalId = setInterval(() => {
                let data = me.generateData();

                tableView.silentVdomUpdate = true;

                store.items.forEach((record, index) => {
                    record.set(data[index])
                });

                tableView.silentVdomUpdate = false;

                tableView.update();

                me.updatePieChart(data)
            }, intervalTime);
        }
    }

    /**
     * @param {Object} data
     */
    updatePieChart(data) {
        let startCharCode = 'A'.charCodeAt(0),
            colorSummary  = {
            colorA: 0,
            colorB: 0,
            colorC: 0,
            colorD: 0,
            colorE: 0
        };

        data.forEach(item => {
            Object.entries(item).forEach(([key, value]) => {
                if (key !== 'id') {
                    colorSummary['color' + String.fromCharCode(startCharCode + value - 1)]++
                }
            })
        });

        this.getReference('pie-chart').chartData = [
            {color: 'A', count: colorSummary['colorA']},
            {color: 'B', count: colorSummary['colorB']},
            {color: 'C', count: colorSummary['colorC']},
            {color: 'D', count: colorSummary['colorD']},
            {color: 'E', count: colorSummary['colorE']}
        ]
    }
}

Neo.setupClass(ViewportController);

export default ViewportController;
