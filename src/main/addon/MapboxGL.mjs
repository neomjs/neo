import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * Helper class to include Mapbox GL maps into your neo.mjs app
 * See: https://docs.mapbox.com/mapbox-gl-js/api/
 * In case you need more API methods to get exposed to the App worker,
 * please open issues inside the tracker and / or submit PRs.
 * @class Neo.main.addon.MapboxGL
 * @extends Neo.main.addon.Base
 */
class MapboxGL extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.MapboxGL'
         * @protected
         */
        className: 'Neo.main.addon.MapboxGL',
        /**
         * Stores all map data inside an object until mounting. key => map id
         * No array since in case a map gets loaded multiple times, we only want to apply the last data on mount.
         * @member {Object} dataMap={}
         * @protected
         */
        dataMap: {},
        /**
         * @member {String} downloadPath='https://api.mapbox.com/mapbox-gl-js/'
         * @protected
         */
        downloadPath: 'https://api.mapbox.com/mapbox-gl-js/',
        /**
         * Stores all extra map sources layers an object.
         * key => map id, value => {Array} layers
         * @member {Object} layers={}
         * @protected
         */
        layers: {},
        /**
         * Stores all map ids inside an object
         * @member {Object} maps={}
         * @protected
         */
        maps: {},
        /**
         * Stores all map config objects which arrived before the map lib scripts got loaded
         * @member {Object[]} mapsToCreate=[]
         * @protected
         */
        mapsToCreate: [],
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'addLayers',
                'addSources',
                'autoResize',
                'center',
                'create',
                'destroy',
                'setFilter',
                'setLayoutProperty',
                'setPaintProperty',
                'setStyle',
                'updateData',
                'zoom'
            ]
        },
        /**
         * @member {Boolean} scriptsLoaded_=true
         * @protected
         */
        scriptsLoaded_: false,
        /**
         * Stores all map sources inside an object.
         * key => map id, value => {Array} sources
         * @member {Object} sources={}
         * @protected
         */
        sources: {},
        /**
         * Stores all map style objects inside an objects to prevent reloads when switching themes multiple times.
         * key => style name (url)
         * @member {Object} styleMap={}
         * @protected
         */
        styleMap: {},
        /**
         * @member {String} version='v1.9.1'
         * @protected
         */
        version: 'v1.9.1',
        /**
         * Stores all map zoom values inside an object until mounting. key => map id
         * No array since in case a map gets zoomed multiple times, we only want to apply the last value on mount.
         * @member {Object} zoomMap={}
         * @protected
         */
        zoomMap: {}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.insertMapboxGLScripts()
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Object[]} data.layers
     */
    addLayers(data) {
        let me  = this,
            map = me.maps[data.id],
            beforeId;

        if (map) {
            data.layers.forEach(item => {
                beforeId = item.beforeId;
                delete item.beforeId;

                map.addLayer(item, beforeId)
            })
        } else {
            me.layers[data.id] = Object.assign(me.layers[data.id] || {}, data)
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Object[]} data.sources
     */
    addSources(data) {
        let me  = this,
            map = me.maps[data.id],
            id;

        if (map) {
            data.sources.forEach(item => {
                id = item.id;
                delete item.id;

                map.addSource(id, item)
            })
        } else {
            me.sources[data.id] = Object.assign(me.sources[data.id] || {}, data)
        }
    }

    /**
     * Triggered after the scriptsLoaded config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetScriptsLoaded(value, oldValue) {
        if (value) {
            let me = this;

            me.mapsToCreate.forEach(config => {
                me.create(config);
            });

            me.mapsToCreate = []
        }
    }

    /**
     * @param {Object} map
     * @param {Object} styleJson
     * @param {String} [name]
     */
    applyStyleObject(map, styleJson, name) {
        if (name) {
            this.styleMap[name] = styleJson
        }

        styleJson.layers.forEach(layer => {
            Object.entries(layer.paint).forEach(([key, value]) => {
                map.setPaintProperty(layer.id, key, value)
            })
        })
    }

    /**
     * Mounting a map into an inactive tab and activating it should call this
     * @param {Object} data
     * @param {String} data.id
     */
    autoResize(data) {
        let map = this.maps[data.id];

        map && this.timeout(100).then(() => {
            map.resize()
        })
    }

    /**
     * @param {Object} data
     * @param {Boolean} [data.animate=false]
     * @param {String} data.id
     * @param {Number} data.lat
     * @param {Number} data.lng
     */
    center(data) {
        let map    = this.maps[data.id],
            center = {lat: data.lat, lng: data.lng};

        if (map) {
            if (data.animate) {
                map.flyTo({center})
            } else {
                map.setCenter(center)
            }
        } else {
            // todo
        }
    }

    /**
     * @param {Object}   data
     * @param {String}   data.accessToken
     * @param {Object}   data.center
     * @param {Object}   [data.data]
     * @param {String}   [data.dataSourceId]
     * @param {String}   data.id
     * @param {Object[]} [data.layers]
     * @param {String}   data.mapboxStyle
     * @param {Object[]} [data.sources]
     * @param {String}   data.zoom
     */
    create(data) {
        let me = this;

        if (!me.scriptsLoaded) {
            me.mapsToCreate.push(data)
        } else {
            mapboxgl.accessToken = data.accessToken;

            let zoom = data.zoom;

            if (me.zoomMap[data.id]) {
                zoom = me.zoomMap[data.id].zoom;
                delete me.zoomMap[data.id]
            }

            me.maps[data.id] = new mapboxgl.Map({
                center   : data.center,
                container: data.id,
                style    : data.mapboxStyle,
                zoom     : zoom
            });

            me.maps[data.id].on('load', me.onMapLoaded.bind(me, data))
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    destroy(data) {
        this.maps[data.id].remove();
        delete this.maps[data.id]
    }

    /**
     * @param {String} id
     * @returns {Boolean}
     */
    hasMap(id) {
        return !!this.maps[id]
    }

    insertMapboxGLScripts() {
        let me       = this,
            basePath = me.downloadPath + me.version + '/';

        Promise.all([
            DomAccess.loadScript(    basePath + 'mapbox-gl.js'),
            DomAccess.loadStylesheet(basePath + 'mapbox-gl.css')
        ]).then(() => {
            me.scriptsLoaded = true
        })
    }

    /**
     * @param {Object} data
     * @param {Object} event
     * @param {Object} event.target map instance
     */
    onMapLoaded(data, event) {
        let me    = this,
            mapId = data.id;

        if (data.sources) {
            me.addSources({
                id     : data.id,
                sources: data.sources
            })
        } else if (me.sources[mapId]) {
            me.addSources(me.sources[mapId]);
            delete me.sources[mapId]
        }

        if (data.layers) {
            me.addLayers({
                id    : data.id,
                layers: data.layers
            })
        } else if (me.layers[mapId]) {
            me.addLayers(me.layers[mapId]);
            delete me.layers[mapId]
        }

        // map.loaded() is false at this point,
        // in case we do add layers / sources
        // the "idle" event seems to be the best fit
        if (event.target.loaded()) {
            me.onMapReallyLoaded(data, event)
        } else {
            event.target.once('idle', me.onMapReallyLoaded.bind(me, data))
        }
    }

    /**
     * @param {Object} data
     * @param {Object} event
     * @param {Object} event.target map instance
     */
    onMapReallyLoaded(data, event) {
        let me = this;

        me.timeout(100).then(() => {
            if (data.data) {
                me.updateData({
                    data        : data.data,
                    dataSourceId: data.dataSourceId,
                    id          : data.id
                })
            } else if (me.dataMap[data.id]) {
                me.updateData(me.dataMap[data.id])
            }
        })
    }

    /**
     * https://docs.mapbox.com/mapbox-gl-js/api/#map#setfilter
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.layerId
     * @param {Object} data.options
     * @param {Boolean} data.options.validate
     * @param {Array} data.value
     */
    setFilter(data) {
        let map = this.maps[data.id];

        if (map) {
            map.setFilter(data.layerId, data.value, data.options || {})
        } else {
            // todo: we could cache this and apply onMapLoaded
        }
    }

    /**
     * https://docs.mapbox.com/mapbox-gl-js/api/#map#setlayoutproperty
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.layerId
     * @param {String} data.key
     * @param {Object} data.options
     * @param {Boolean} data.options.validate
     * @param {String} data.value
     */
    setLayoutProperty(data) {
        let map = this.maps[data.id];

        if (map) {
            map.setLayoutProperty(data.layerId, data.key, data.value, data.options || {})
        } else {
            // todo: we could cache this and apply onMapLoaded
        }
    }

    /**
     * https://docs.mapbox.com/mapbox-gl-js/api/#map#setpaintproperty
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.layerId
     * @param {String} data.key
     * @param {Object} data.options
     * @param {Boolean} data.options.validate
     * @param {String} data.value
     */
    setPaintProperty(data) {
        let map = this.maps[data.id];

        if (map) {
            map.setPaintProperty(data.layerId, data.key, data.value, data.options || {})
        } else {
            // todo: we could cache this and apply onMapLoaded
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.accessToken
     * @param {String} data.id
     * @param {Object|String} data.style
     */
    setStyle(data) {
        let me = this;

        if (!me.scriptsLoaded || !me.hasMap(data.id)) {
            // todo
        } else {
            if (Neo.isString(data.style)) {
                if (data.style.indexOf('mapbox://styles/') === 0) {
                    data.style = data.style.substring(16)
                }

                if (me.styleMap[data.style]) {
                    me.applyStyleObject(me.maps[data.id], me.styleMap[data.style])
                } else {
                    fetch(`https://api.mapbox.com/styles/v1/${data.style}?access_token=${data.accessToken}`)
                        .then(response => response.json())
                        .then(styleJson => me.applyStyleObject(me.maps[data.id], styleJson, data.style))
                }
            }

            // map.setStyle breaks with only a console.warn()
            // => causing a full repaint, losing custom sources & layers
            // map.setStyle(data.style);
        }
    }

    /**
     * @param {Object} data
     * @param {Object} data.data
     * @param {String} data.dataSourceId
     * @param {String} data.id
     */
    updateData(data) {
        let me = this;

        if (!me.scriptsLoaded || !me.hasMap(data.id)) {
            me.dataMap[data.id] = data;
        } else {
            let map    = me.maps[data.id],
                source = map.getSource(data.dataSourceId);

            if (source) {
                source.setData(data.data);
                delete me.dataMap[data.id]
            } else {
                me.dataMap[data.id] = data
            }
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Number} data.zoom
     */
    zoom(data) {
        let map = this.maps[data.id];

        if (map) {
            map.setZoom(data.zoom)
        } else {
            this.zoomMap[data.id] = data
        }
    }
}

export default Neo.setupClass(MapboxGL);
