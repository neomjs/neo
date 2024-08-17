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
         * @member {String} downloadPath='https//www.amcharts.com/lib/4/'
         * @protected
         */
        downloadPath: 'https://www.amcharts.com/lib/4/',
        /**
         * @member {String} fallbackPath='https://neomjs.github.io/pages/resources_pub/amCharts/'
         * @protected
         */
        fallbackPath: 'https://neomjs.github.io/pages/resources_pub/amCharts/',
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
        }
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

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'callMethod', data})
        } else {
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

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'create', data})
        } else {
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
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    destroy(data) {
        let me = this;

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'destroy', data})
        } else {
            me.charts[data.id]?.dispose?.();
            delete me.charts[data.id]
        }
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
    loadFiles(useFallback=false) {
        let me       = this,
            basePath = useFallback ? me.fallbackPath : me.downloadPath;

        me.isLoading = true;

        DomAccess.loadScript(basePath + 'core.js').then(() => {
            Promise.all([
                DomAccess.loadScript(basePath + 'charts.js'),
                DomAccess.loadScript(basePath + 'maps.js'),
                DomAccess.loadScript(basePath + 'themes/dark.js'),
                DomAccess.loadScript(basePath + 'geodata/worldLow.js')
            ]).then(() => {
                me.isLoading = false;
                me.isReady   = true
            })
        }).catch(e => {
            console.log('Download from amcharts.com failed, switching to fallback', e);
            me.loadFiles(true)
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Object} data.properties
     */
    setProperties(data) {
        let me = this;

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'setProperties', data})
        } else {
            Object.entries(data.properties).forEach(([key, value]) => {
                me.setProperty({
                    id   : data.id,
                    path : key,
                    value
                })
            })
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Boolean} [data.isColor=false] true will wrap the value into am4core.color()
     * @param {String} data.path
     * @param {*} data.value
     */
    setProperty(data) {
        let me = this;

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'setProperty', data})
        } else {
            if (this.hasChart(data.id)) {
                let chart        = this.charts[data.id],
                    pathArray    = data.path.split('.'),
                    propertyName = pathArray.pop(),
                    scope        = Neo.ns(pathArray.join('.'), false, chart);

                scope[propertyName] = data.isColor ? am4core.color(data.value) : data.value
            } else {
                // todo
            }
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

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'updateData', data})
        } else if (!me.hasChart(data.id)) {
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

Neo.setupClass(AmCharts);

export default AmCharts;
