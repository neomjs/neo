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
        console.log('insertAmChartsScripts');
    }
}

Neo.applyClassConfig(AmCharts);

export {AmCharts as default};