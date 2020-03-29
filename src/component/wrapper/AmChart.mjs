import {default as Component} from '../Base.mjs';

/**
 * Convenience class to render an amChart
 * Requires setting Neo.config.useAmCharts to true (or manually include the lib)
 * @class Neo.component.wrapper.AmChart
 * @extends Neo.component.Base
 */
class AmChart extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.wrapper.AmChart'
         * @private
         */
        className: 'Neo.component.wrapper.AmChart',
        /**
         * @member {String} ntype='am-chart'
         * @private
         */
        ntype: 'am-chart',
        /**
         * See: https://www.amcharts.com/docs/v4/
         * @member {Object} chartConfig=null
         */
        chartConfig: null,
        /**
         * @member {String} chartType='XYChart'
         */
        chartType: 'XYChart',
        /**
         * am4charts, am4maps
         * @member {String} package='am4charts'
         */
        package: 'am4charts'
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        const me = this;

        if (!me.chartConfig) {
            console.error('wrapper.AmChart defined without a chartConfig', me.id);
        }

        me.on('mounted', () => {
            Neo.main.AmCharts.create({
                config : me.chartConfig,
                id     : me.id,
                package: me.package,
                type   : me.chartType
            }).then(me.onChartMounted);
        });
    }

    /**
     * Override this method to trigger logic after the chart got mounted into the dom
     */
    onChartMounted() {

    }
}

Neo.applyClassConfig(AmChart);

export {AmChart as default};