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
     * @param {Object} data
     * @param {Object} data.config
     * @param {String} data.id
     * @param {String} data.type='XYChart'
     */
    createChart(data) {
        console.log('createChart', data);

        setTimeout(() => {
           am4core.createFromConfig(data.config, data.id, am4charts[data.type || 'XYChart']);
        }, 1000);
    }

    /**
     * Async approach
     * core.js has to arrive first or the other scripts will cause JS errors since they rely on it
     * => fetching the other files after core.js is loaded
     */
    insertAmChartsScripts() {
        const me       = this,
              basePath = '//www.amcharts.com/lib/4/';

        me.loadScript(basePath + 'core.js').then(() => {
            Promise.all([
                me.loadScript(basePath + 'charts.js'),
                me.loadScript(basePath + 'maps.js')
            ]).then(() => {
                console.log('#####amCharts ready');
            });
        });
    }
}

Neo.applyClassConfig(AmCharts);

export {AmCharts as default};