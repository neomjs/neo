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

        setTimeout(() => {
            am4core.createFromConfig(config, 'am-chart-1', am4charts.PieChart);
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

    /**
     * Include a script into the document.head
     * Could get moved into DomAccess in case other mixins need it
     * @param {String} src
     * @param {Boolean} [async=true]
     * @return {Promise<unknown>}
     */
    loadScript(src, async=true) {
        let script;

        return new Promise((resolve, reject) => {
            script = document.createElement('script');

            Object.assign(script, {
                async  : async,
                onerror: reject,
                onload : resolve,
                src    : src
            });

            document.head.appendChild(script);
        });
    }
}

Neo.applyClassConfig(AmCharts);

export {AmCharts as default};