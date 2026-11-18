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
            })
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
     * @summary Asks the main thread to create the chart in the amCharts theme {@link #resolveTheme} answers.
     * @protected
     */
    createChart() {
        let me                      = this,
            {appName, id, windowId} = me,
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

        me.timeout(50).then(() => {
            Neo.main.addon.AmCharts.create(opts).then(me.onChartMounted)
        })
    }

    destroy(...args) {
        let {appName, id, windowId} = this;

        Neo.main.addon.AmCharts.destroy({appName, id, windowId})

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
