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
         * Stores all chart data inside an object. key => chart id
         * No array since in case a chart gets loaded multiple times, we only want to apply the last data on mount.
         * @member {Object} charts={}
         * @private
         */
        dataMap: {},
        /**
         * @member {String} downLoadPath='https//www.amcharts.com/lib/4/'
         * @private
         */
        downLoadPath: 'https://www.amcharts.com/lib/4/',
        /**
         * @member {String} fallbackPath='https://neomjs.github.io/pages/resources/amCharts/'
         * @private
         */
        fallbackPath: 'https://neomjs.github.io/pages/resources/amCharts/',
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
                'callMethod',
                'create',
                'setProperty',
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

            setTimeout(() => {
                Object.entries(me.dataMap).forEach((key, dataValue) => {
                    me.updateData(dataValue);
                });

                me.dataMap = {};
            }, 1000);
        }
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.path
     * @param {Array} [data.params]
     */
    callMethod(data) {
        if (this.hasChart(data.id)) {
            const chart      = this.charts[data.id],
                  pathArray  = data.path.split('.'),
                  methodName = pathArray.pop(),
                  scope      = Neo.ns(pathArray.join('.'), false, chart);

            scope[methodName].call(scope, ...data.params || []);
        } else {
            // todo
        }
    }

    /**
     *
     * @param {Object} data
     * @param {Boolean} data.combineSeriesTooltip
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
            // todo: check if self[data.package] exists, if not load it and call create afterwards

            me.charts[data.id] = am4core.createFromConfig(data.config, data.id, self[data.package][data.type || 'XYChart']);

            if (data.combineSeriesTooltip) {
                me.combineSeriesTooltip(me.charts[data.id]);
            }

            // in case data has arrived before the chart got created, apply it now
            if (me.dataMap[data.id]) {
                me.updateData(me.dataMap[data.id]);
                delete me.dataMap[data.id];
            }
        }
    }

    /**
     *
     * @param {Object} chart
     */
    combineSeriesTooltip(chart) {
        chart.series.each(series => {
            series.adapter.add('tooltipText', () => {
                let text = "[bold]{dateX}[/]\n";

                chart.series.each(item => {
                    text += "[" + item.stroke + "]●[/] " + item.name + ": {" + item.dataFields.valueY + "}\n";
                });

                return text;
            });
        });
    }

    /**
     *
     * @param {String} id
     * @return {Boolean}
     */
    hasChart(id) {
        return !!this.charts[id];
    }

    /**
     * Async approach
     * core.js has to arrive first or the other scripts will cause JS errors since they rely on it
     * => fetching the other files after core.js is loaded
     */
    insertAmChartsScripts(useFallback=false) {
        const me       = this,
              basePath = useFallback ? me.fallbackPath : me.downLoadPath;

        DomAccess.loadScript(basePath + 'core.js').then(() => {
            Promise.all([
                DomAccess.loadScript(basePath+ 'charts.js'),
                DomAccess.loadScript(basePath + 'maps.js'),
                DomAccess.loadScript(basePath + 'geodata/worldLow.js')
            ]).then(() => {
                me.scriptsLoaded = true;
            });
        }).catch(e => {
            console.log('Download from amcharts.com failed, switching to fallback', e);
            me.insertAmChartsScripts(true);
        });
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.id
     * @param {Boolean} [data.isColor=false] true will wrap the value into am4core.color()
     * @param {String} data.path
     * @param {*} data.value
     */
    setProperty(data) {
        if (this.hasChart(data.id)) {
            const chart        = this.charts[data.id],
                  pathArray    = data.path.split('.'),
                  propertyName = pathArray.pop(),
                  scope        = Neo.ns(pathArray.join('.'), false, chart);

            scope[propertyName] = data.isColor ? am4core.color(data.value) : data.value;
        } else {
            // todo
        }
    }

    /**
     *
     * @param {Object} data
     * @param {Object} data.data
     * @param {String} data.dataPath
     * @param {String} data.id
     */
    updateData(data) {
        const me = this;

        if (!me.scriptsLoaded || !me.hasChart(data.id)) {
            me.dataMap[data.id] = data;
        } else {
            const chart = me.charts[data.id];

            if (data.dataPath === '') {
                chart.data = data.data;
            } else {
                Neo.ns(data.dataPath, false, chart).data = data.data;
            }
        }
    }
}

Neo.applyClassConfig(AmCharts);

let instance = Neo.create(AmCharts);

Neo.applyToGlobalNs(instance);

export default instance;