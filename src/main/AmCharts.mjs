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
         * Stores all chart ids inside an object
         * @member {Object} charts={}
         * @private
         */
        charts: {},
        /**
         * Stores all chart config objects which arrived before the chart lib scripts got loaded
         * @member {Object[]} chartsToCreate=[]
         * @private
         */
        chartsToCreate: [],
        /**
         * @member {Boolean} scriptsLoaded_=true
         * @private
         */
        scriptsLoaded_: false,
        /**
         * @member {Boolean} singleton=true
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

        if (Neo.config.useAmCharts) {
            this.insertAmChartsScripts();
        }
    }

    /**
     * Triggered after the scriptsLoaded config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetScriptsLoaded(value, oldValue) {
        if (value) {
            const me = this;

            me.chartsToCreate.forEach(config => {
                me.create(config);
            });

            me.chartsToCreate = [];
        }
    }

    /**
     *
     * @param {Object} data
     * @param {Object} data.config
     * @param {String} data.id
     * @param {String} data.package
     * @param {String} data.type='XYChart'
     */
    create(data) {
        const me = this;

        if (!me.scriptsLoaded) {
            me.chartsToCreate.push(data);
        } else {
            console.log('create', data);
            console.log(am4core);
            console.log(am4geodata_worldLow);

            me.charts[data.id] = am4core.createFromConfig(data.config, data.id, self[data.package][data.type || 'XYChart']);
        }
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
                DomAccess.loadScript(basePath + 'maps.js'),
                DomAccess.loadScript(basePath + 'geodata/worldLow.js')
            ]).then(() => {
                this.scriptsLoaded = true;
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