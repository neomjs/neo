import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * Helper class to include amCharts into your neo.mjs app
 * https://www.amcharts.com/docs/v4/
 * @class Neo.main.addon.AmCharts
 * @extends Neo.main.addon.Base
 */
class AmCharts extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.AmCharts'
         * @protected
         */
        className: 'Neo.main.addon.AmCharts',
        /**
         * Stores all chart ids inside an object
         * @member {Object} charts={}
         * @protected
         */
        charts: {},
        /**
         * Stores all chart data inside an object. key => chart id
         * No array since in case a chart gets loaded multiple times, we only want to apply the last data on mount.
         * @member {Object} dataMap={}
         * @protected
         */
        dataMap: {},
        /**
         * @member {String} downloadPath='https//cdn.amcharts.com/lib/4/'
         * @protected
         */
        downloadPath: 'https://cdn.amcharts.com/lib/4/',
        /**
         * @member {String} fallbackPath='https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/amCharts'
         * @protected
         */
        fallbackPath: 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/amCharts/',
        /**
         * List methods which must get cached until the addon reaches its `isReady` state
         * @member {String[]} interceptRemotes
         */
        interceptRemotes: [
            'callMethod',
            'create',
            'destroy',
            'setProperties',
            'setProperty',
            'updateData'
        ],
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'callMethod',
                'create',
                'destroy',
                'setProperties',
                'setProperty',
                'updateData'
            ]
        },
        /**
         * Enforce using the fallbackPath
         * @member {Boolean} useFallbackPath=false
         * @protected
         */
        useFallbackPath: false
    }

    /**
     * Triggered after the isReady config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsReady(value, oldValue) {
        super.afterSetIsReady(value, oldValue);

        if (value) {
            let me = this;

            me.timeout(1000).then(() => {
                Object.entries(me.dataMap).forEach(([key, dataValue]) => {
                    me.updateData(dataValue)
                });

                me.dataMap = {}
            })
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.path
     * @param {Array} [data.params]
     */
    callMethod(data) {
        let me = this;

        if (me.hasChart(data.id)) {
            let chart      = me.charts[data.id],
                pathArray  = data.path.split('.'),
                methodName = pathArray.pop(),
                scope      = pathArray.length < 1 ? chart:  Neo.ns(pathArray.join('.'), false, chart);

            scope[methodName].call(scope, ...data.params || [])
        } else {
            // todo
        }
    }

    /**
     * @param {Object} chart
     */
    combineSeriesTooltip(chart) {
        chart.series.each(series => {
            series.adapter.add('tooltipText', () => {
                let text = "[bold]{dateX}[/]\n";

                chart.series.each(item => {
                    text += "[" + item.stroke + "]●[/] " + item.name + ": {" + item.dataFields.valueY + "}\n"
                });

                return text
            })
        })
    }

    /**
     * @param {Object}  data
     * @param {Boolean} data.combineSeriesTooltip
     * @param {Object}  data.config
     * @param {Array}   [data.data]
     * @param {String}  [data.dataPath]
     * @param {String}  data.id
     * @param {String}  data.package
     * @param {String}  data.type='XYChart'
     */
    create(data) {
        let me = this;

        // todo: check if globalThis[data.package] exists, if not load it and call create afterwards
        am4core.useTheme(am4themes_dark);

        me.charts[data.id] = am4core.createFromConfig(data.config, data.id, globalThis[data.package][data.type || 'XYChart']);

        if (data.combineSeriesTooltip) {
            me.combineSeriesTooltip(me.charts[data.id])
        }

        // in case data has arrived before the chart got created, apply it now
        if (data.data) {
            me.updateData({
                data    : data.data,
                dataPath: data.dataPath,
                id      : data.id
            })
        } else if (me.dataMap[data.id]) {
            me.updateData(me.dataMap[data.id]);
            delete me.dataMap[data.id]
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    destroy({id}) {
        this.charts[id]?.dispose?.();
        delete this.charts[id]
    }

    /**
     * @param {String} id
     * @returns {Boolean}
     */
    hasChart(id) {
        return !!this.charts[id]
    }

    /**
     * Async approach
     * core.js has to arrive first or the other scripts will cause JS errors since they rely on it
     * => fetching the other files after core.js is loaded
     * @param {Boolean} useFallback=false
     */
    async loadFiles(useFallback=false) {
        let me              = this,
            useFallbackPath = me.useFallbackPath || useFallback,
            basePath;

        if (useFallbackPath && Neo.config.isGitHubPages) {
            basePath = '../../../../resources_pub/amCharts/';

            if (Neo.config.environment !== 'development') {
                basePath = `../../${basePath}`
            }
        } else {
            basePath = useFallbackPath ? me.fallbackPath : me.downloadPath
        }

        try {
            await DomAccess.loadScript(basePath + 'core.js');

            await Promise.all([
                DomAccess.loadScript(basePath + 'charts.js'),
                DomAccess.loadScript(basePath + 'maps.js'),
                DomAccess.loadScript(basePath + 'themes/dark.js'),
                DomAccess.loadScript(basePath + 'geodata/worldLow.js')
            ])
        } catch(e) {
            if (!useFallback && !me.useFallbackPath) {
                console.log('Download from amcharts.com failed, switching to fallback', e);
                await me.loadFiles(true)
            }
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Object} data.properties
     */
    setProperties({id, properties}) {
        Object.entries(properties).forEach(([key, value]) => {
            this.setProperty({id, path: key, value})
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Boolean} [data.isColor=false] true will wrap the value into am4core.color()
     * @param {String} data.path
     * @param {*} data.value
     */
    setProperty({id, isColor=false, path, value}) {
        if (this.hasChart(id)) {
            let chart        = this.charts[id],
                pathArray    = path.split('.'),
                propertyName = pathArray.pop(),
                scope        = Neo.ns(pathArray.join('.'), false, chart);

            scope[propertyName] = isColor ? am4core.color(value) : value
        } else {
            // todo
        }
    }

    /**
     * @param {Object} data
     * @param {Object} data.data
     * @param {String} data.dataPath
     * @param {String} data.id
     */
    updateData(data) {
        let me = this;

        if (!me.hasChart(data.id)) {
            me.dataMap[data.id] = data
        } else {
            let chart = me.charts[data.id];

            if (data.dataPath === '') {
                chart.data = data.data
            } else {
                Neo.ns(data.dataPath, false, chart).data = data.data
            }
        }
    }
}

export default Neo.setupClass(AmCharts);
