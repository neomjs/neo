import Component from '../Base.mjs';

/**
 * @summary Renders an amCharts 4 chart through the main thread's AmCharts addon, created in the
 * amCharts theme that matches the chart's Neo theme ({@link #themeMap}).
 * Requires setting Neo.config.useAmCharts to true (or manually include the lib)
 * @class Neo.component.wrapper.AmChart
 * @extends Neo.component.Base
 */
class AmChart extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.wrapper.AmChart'
         * @protected
         */
        className: 'Neo.component.wrapper.AmChart',
        /**
         * @member {String} ntype='am-chart'
         * @protected
         */
        ntype: 'am-chart',
        /**
         * See: https://www.amcharts.com/docs/v4/
         * @member {Object} chartConfig_=null
         * @reactive
         */
        chartConfig_: null,
        /**
         * Stores the chart data
         * @member {Array|null} chartData_=null
         * @reactive
         */
        chartData_: null,
        /**
         * @member {String} chartType='XYChart'
         */
        chartType: 'XYChart',
        /**
         * It is not possible to define adapters via json, so we pass a flag to main instead
         * @member {Boolean} combineSeriesTooltip=false
         */
        combineSeriesTooltip: false,
        /**
         * Charts & maps can have different targets to apply the data to. E.g.:
         * myChart.data = data; // => ''
         * myChart.series.values[0].data = data; // => 'series.values.0'
         * Use a Neo.ns() conform syntax with dots between props
         * @member {String} dataPath=''
         */
        dataPath: '',
        /**
         * `true` while the chart shows its current data, reflected as `data-drawn` on the root like
         * {@link Neo.component.Canvas#drawn_}. amCharts draws in the main thread after a create or a data change,
         * so the moment comes from {@link Neo.main.addon.AmCharts#whenDrawn}.
         * @member {Boolean} drawn_=false
         * @reactive
         */
        drawn_: false,
        /**
         * am4charts, am4maps
         * @member {String} package='am4charts'
         */
        package: 'am4charts',
        style: {
            height: '100%'
        },
        /**
         * Maps a Neo theme onto the amCharts theme a chart is created in: `'dark'` for `am4themes_dark`,
         * `null` for amCharts' own light default.
         *
         * A map rather than a test on the theme's name, because `neo-theme-cyberpunk` is dark and its
         * name does not say so: the shape of {@link Neo.component.wrapper.MonacoEditor#themeMap}.
         * Extend it for a theme Neo does not ship.
         * @member {Object} themeMap
         */
        themeMap: {
            'neo-theme-cyberpunk': 'dark',
            'neo-theme-dark'     : 'dark',
            'neo-theme-light'    : null,
            'neo-theme-neo-dark' : 'dark',
            'neo-theme-neo-light': null
        },
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {style: {position: 'relative'}, cn: [
            {style: {position: 'absolute', height: '100%', width: '100%'}, cn: [{}]}
        ]}
    }

    /**
     * The amCharts theme the chart was last created in, `undefined` before the first create.
     * @member {String|null|undefined} #createdTheme
     * @private
     */
    #createdTheme
    /**
     * Counts the creates and data changes whose drawn answer is owed, so only the latest one sets `drawn`.
     * @member {Number} #drawnRequest=0
     * @private
     */
    #drawnRequest = 0
    /**
     * Cancels the create that {@link #createChart} has scheduled and not yet sent, or `null`.
     * @member {AbortController|null} #pendingCreate=null
     * @private
     */
    #pendingCreate = null

    /**
     * Triggered after the chartData config got changed
     * @param {Array|null} value
     * @param {Array|null} oldValue
     * @protected
     */
    afterSetChartData(value, oldValue) {
        let me = this,
            {appName, dataPath, id, windowId} = me;

        if (value) {
            Neo.main.addon.AmCharts.updateData({
                appName,
                data: value,
                dataPath,
                id,
                windowId
            });

            me.mounted && me.syncDrawn()
        }
    }

    /**
     * Triggered after the drawn config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDrawn(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.vdom['data-drawn'] = value ? 'true' : null;
            // destroy() clears drawn on its way out: a chart that is going away renders nothing more
            !me.isDestroying && me.update()
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        let me                      = this,
            {appName, id, windowId} = me;

        if (value === false && oldValue !== undefined) {
            // a create still waiting for its slot would draw into a chart that is gone
            me.#pendingCreate?.abort();
            me.clearDrawn();
            Neo.main.addon.AmCharts.destroy({appName, id, windowId})
        }

        super.afterSetMounted(value, oldValue);

        value && me.createChart()
    }

    /**
     * Triggered after the theme config got changed.
     * amCharts applies a theme when it creates a chart, so a mounted chart whose amCharts theme
     * changes is created again; a change that resolves to the same amCharts theme leaves it alone.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);

        let me                      = this,
            {appName, id, windowId} = me;

        if (me.mounted && me.resolveTheme() !== me.#createdTheme) {
            Neo.main.addon.AmCharts.destroy({appName, id, windowId});
            me.createChart()
        }
    }

    /**
     * Triggered before the chartConfig config gets changed.
     * Resolves its `'@config:'` strings, passed as one item: a bare object would read as a keyed items map.
     * @param {Object} value
     * @param {Object} oldValue
     * @returns {Object}
     * @protected
     */
    beforeSetChartConfig(value, oldValue) {
        if (!value) {
            console.error('wrapper.AmChart defined without a chartConfig', this.id)
        }

        this.parseItemConfigs([value]);
        return value
    }

    /**
     * @summary Drops `drawn` and voids the answer still owed for the chart's last create or data.
     * @protected
     */
    clearDrawn() {
        this.#drawnRequest++;
        this.drawn = false
    }

    /**
     * @summary Asks the main thread to create the chart in the amCharts theme {@link #resolveTheme} answers.
     *
     * The create goes out 50 ms later. A newer create cancels one still waiting, and so do an unmount and
     * `destroy()`, so only the latest request reaches the main thread and none arrives after the chart is gone.
     * @protected
     */
    createChart() {
        let me                      = this,
            {appName, id, windowId} = me,
            pending                 = new AbortController(),
            theme                   = me.resolveTheme(),
            opts                    = {
                appName,
                combineSeriesTooltip: me.combineSeriesTooltip,
                config              : me.chartConfig,
                id,
                package             : me.package,
                theme,
                type                : me.chartType,
                windowId
            };

        if (me.chartData) {
            opts.data     = me.chartData;
            opts.dataPath = me.dataPath
        }

        me.#createdTheme = theme;

        me.#pendingCreate?.abort();
        me.#pendingCreate = pending;
        me.clearDrawn();

        me.timeout(50, {signal: pending.signal}).then(() => {
            me.#pendingCreate = null;

            Neo.main.addon.AmCharts.create(opts).then(() => {
                if (!me.isDestroyed) {
                    me.onChartMounted();
                    me.syncDrawn()
                }
            })
        }, () => {}) // cancelled by a newer create, an unmount or destroy()
    }

    /**
     * @summary Drops `drawn` and voids the answer still owed, then destroys the main-thread chart.
     * @param {...*} args
     */
    destroy(...args) {
        let me                      = this,
            {appName, id, windowId} = me;

        me.clearDrawn();
        Neo.main.addon.AmCharts.destroy({appName, id, windowId});

        super.destroy(...args)
    }

    /**
     *
     */
    getVdomRoot() {
        return this.vdom.cn[0].cn[0]
    }

    /**
     *
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0].childNodes[0]
    }

    /**
     * Override this method to trigger logic after the chart got mounted into the dom
     */
    onChartMounted() {

    }

    /**
     * @summary Resolves the amCharts theme this chart is created in from its Neo theme.
     * Goes through {@link Neo.component.Base#getTheme}, never the `theme` config: a chart inside a
     * themed container inherits the container's theme and declares none of its own.
     * @returns {String|null} `'dark'`, or null for amCharts' light default
     * @protected
     */
    resolveTheme() {
        return this.themeMap[this.getTheme()] ?? null
    }

    /**
     * @summary Sets `drawn` from the main thread's answer for the chart's latest create or data.
     * An answer that arrives after a newer create or data change, an unmount or `destroy()` is dropped.
     * @returns {Promise<void>}
     * @protected
     */
    async syncDrawn() {
        let me                      = this,
            {appName, id, windowId} = me,
            request, drawn;

        me.clearDrawn();
        request = me.#drawnRequest;
        drawn   = await Neo.main.addon.AmCharts.whenDrawn({appName, id, windowId});

        if (!me.isDestroyed && request === me.#drawnRequest) {
            me.drawn = drawn
        }
    }

    /**
     * Serializes the AmChart into a JSON-compatible object.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            chartConfig         : me.serializeConfig(me.chartConfig),
            chartData           : me.serializeConfig(me.chartData),
            chartType           : me.chartType,
            combineSeriesTooltip: me.combineSeriesTooltip,
            dataPath            : me.dataPath,
            package             : me.package
        }
    }
}

export default Neo.setupClass(AmChart);
