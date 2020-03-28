import Base      from '../core/Base.mjs';
import DomAccess from './DomAccess.mjs';

/**
 * Helper class to include amCharts into your neo.mjs app
 * https://www.amcharts.com/docs/v4/
 * @class Neo.main.AmCharts
 * @extends Neo.core.Base
 * @singleton
 */
class AmCharts extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.main.AmCharts'
         * @private
         */
        className: 'Neo.main.AmCharts',
        /**
         * @member {boolean} singleton=true
         * @private
         */
        singleton: true,
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @private
         */
        remote: {
            app: [
                'create',
                'toggleLogarithmic',
                'updateData'
            ]
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);
        this.insertAmChartsScripts();
    }

    /**
     *
     * @param {Object} data
     * @param {Object} data.config
     * @param {String} data.id
     * @param {String} data.type='XYChart'
     */
    create(data) {
        console.log('create', data);
        const me = this;

        me.charts = me.charts || {}; // todo: refactor this class into a singleton

        setTimeout(() => {
            me.charts[data.id] = am4core.createFromConfig(data.config, data.id, am4charts[data.type || 'XYChart']);
            console.log(me.charts[data.id]);
        }, 1000);
    }

    /**
     *
     * @param {String} id
     * @return {Boolean}
     */
    hasChart(id) {
        if (!this.charts[id]) {
            console.log('main.AmCharts: no chart found for data.id =>', id);
            return false;
        }

        return true;
    }

    /**
     * Async approach
     * core.js has to arrive first or the other scripts will cause JS errors since they rely on it
     * => fetching the other files after core.js is loaded
     */
    insertAmChartsScripts() {
        const basePath = '//www.amcharts.com/lib/4/';

        DomAccess.loadScript(basePath + 'core.js').then(() => {
            Promise.all([
                DomAccess.loadScript(basePath + 'charts.js'),
                DomAccess.loadScript(basePath + 'maps.js')
            ]).then(() => {
                console.log('#####amCharts ready');
            });
        });
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.id
     * @param {Boolean} data.value
     */
    toggleLogarithmic(data) {
        if (this.hasChart(data.id)) {
            this.charts[data.id].yAxes.values[0].logarithmic = data.value;
        }
    }

    /**
     *
     * @param {Object} data
     * @param {Object} data.data
     * @param {String} data.id
     */
    updateData(data) {
        if (this.hasChart(data.id)) {
            this.charts[data.id].data = data.data;
        }
    }
}

Neo.applyClassConfig(AmCharts);

let instance = Neo.create(AmCharts);

Neo.applyToGlobalNs(instance);

export default instance;