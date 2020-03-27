import Base from '../../core/Base.mjs';

/**
 * Helper class to include amCharts into your neo.mjs app
 * https://www.amcharts.com/docs/v4/
 * @class Neo.main.mixins.AmCharts
 * @extends Neo.core.Base
 * @singleton
 */
class AmCharts extends Base {
    static getConfig() {
        return {
            /**
             * @member {String} className='Neo.main.mixins.AmCharts'
             * @private
             */
            className: 'Neo.main.mixins.AmCharts'
        }
    }

    /**
     *
     * @param {Object} config
     */
    createLineChart(config) {
        console.log('createLineChart', config);

        const id = config.id;
        delete config.id;

        setTimeout(() => {
            am4core.createFromConfig(config, id, am4charts.PieChart);
        }, 1000);
    }

    /**
     *
     */
    insertAmChartsScripts() {
        const me       = this,
              basePath = '//www.amcharts.com/lib/4/';

        me.loadScript(basePath + 'core.js').then(() => {
            me.loadScript(basePath + 'charts.js');
            me.loadScript(basePath + 'maps.js');
        });
    }
}

Neo.applyClassConfig(AmCharts);

export {AmCharts as default};