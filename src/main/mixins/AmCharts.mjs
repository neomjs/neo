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
     */
    insertAmChartsScripts() {
        const basePath = '//www.amcharts.com/lib/4/';
        let script;

        ['core.js', 'charts.js', 'maps.js'].forEach(item => {
            script = document.createElement('script');

            // async has to be false: charts & maps load faster than core => console.error
            Object.assign(script, {async: false, src: basePath + item});
            document.head.appendChild(script);
        });
    }
}

Neo.applyClassConfig(AmCharts);

export {AmCharts as default};