import Component from '../Base.mjs';

/**
 * Convenience class to render an amChart
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
         */
        chartConfig_: null,
        /**
         * Stores the chart data
         * @member {Array|null} chartData_=null
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
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {style: {position: 'relative', height: '100%', width: '100%'}, cn: [
            {style: {position: 'absolute', height: '100%', width: '100%'}, cn: [
                {style: {color:'red',height: '100%'}}
            ]}
        ]}
    }

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
            {appName, id, windowId} = me,
            opts                    = {appName, id, windowId};

        if (value === false && oldValue !== undefined) {
            Neo.main.addon.AmCharts.destroy(opts)
        }

        super.afterSetMounted(value, oldValue);

        if (value) {
            opts = {
                ...opts,
                combineSeriesTooltip: me.combineSeriesTooltip,
                config              : me.chartConfig,
                package             : me.package,
                type                : me.chartType
            };

            if (me.chartData) {
                opts.data     = me.chartData;
                opts.dataPath = me.dataPath;
            }

            me.timeout(50).then(() => {
                Neo.main.addon.AmCharts.create(opts).then(me.onChartMounted)
            })
        }
    }

    /**
     * Triggered before the chartConfig config gets changed.
     * @param {Object} value
     * @param {Object} oldValue
     * @returns {Object}
     * @protected
     */
    beforeSetChartConfig(value, oldValue) {
        if (!value) {
            console.error('wrapper.AmChart defined without a chartConfig', this.id)
        }

        this.parseItemConfigs(value);
        return value
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
}

Neo.setupClass(AmChart);

export default AmChart;
