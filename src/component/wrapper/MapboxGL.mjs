import Component from '../Base.mjs';

/**
 * Convenience class to render Mapbox GL maps
 * Requires setting Neo.config.useMapboxGL to true (or manually include the lib)
 * @class Neo.component.wrapper.MapboxGL
 * @extends Neo.component.Base
 */
class MapboxGL extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.wrapper.MapboxGL'
         * @protected
         */
        className: 'Neo.component.wrapper.MapboxGL',
        /**
         * @member {String} ntype='mapboxgl'
         * @protected
         */
        ntype: 'mapboxgl',
        /**
         *
         * @member {String|null} accessToken=null
         */
        accessToken: null,
        /**
         * @member {Array|null} chartData_=null
         */
        chartData_: null,
        /**
         * @member {Object} center_={lat: 0, lng: 0}
         */
        center_: {lat: 0, lng: 0},
        /**
         * @member {Boolean} convertDataToGeoJson=true
         * @protected
         */
        convertDataToGeoJson: true,
        /**
         * Assuming there is just 1 source for data changes.
         * Create a ticket in case it needs to get enhanced.
         * @member {String|null} dataSourceId=null
         */
        dataSourceId: null,
        /**
         * Additional layers to add to the map style.
         * beforeId is a custom property which will get passed as the second param for:
         * https://docs.mapbox.com/mapbox-gl-js/api/#map#addlayer
         * @member {Object[]|null} layers_=null
         */
        layers_: null,
        /**
         * https://docs.mapbox.com/mapbox-gl-js/style-spec/
         * @member {Object|String} mapboxStyle=null
         */
        mapboxStyle_: null,
        /**
         * Data sources for the map.
         * id is a custom property which will get passed as the first param for:
         * https://docs.mapbox.com/mapbox-gl-js/api/#map#addsource
         * @member {Object[]|null} sources_=null
         */
        sources_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {style: {position: 'relative', height: '100%', width: '100%'}, cn: [
            {style: {position: 'absolute', height: '100%', width: '100%'}, cn: [
                {style: { height: '100%'}}
            ]}
        ]},
        /**
         *
         * @member {Number} zoom_=3
         */
        zoom_: 3
    }

    /**
     * Triggered after the center config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetCenter(value, oldValue) {
        this.centerMap(value)
    }

    /**
     * Triggered after the chartData config got changed
     * @param {Array|null} value
     * @param {Array|null} oldValue
     * @protected
     */
    afterSetChartData(value, oldValue) {
        let me = this,
            {appName, dataSourceId, id, windowId} = me;

        value && Neo.main.addon.MapboxGL.updateData({
            appName,
            data: value,
            dataSourceId,
            id,
            windowId
        })
    }

    /**
     * Triggered after the layers config got changed
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetLayers(value, oldValue) {
        let me = this,
            {appName, id, windowId} = me;

        value && Neo.main.addon.MapboxGL.addLayers({
            appName,
            id,
            layers: value,
            windowId
        })
    }

    /**
     * Triggered after the mapboxStyle config got changed
     * @param {Object|String} value
     * @param {Object|String} oldValue
     * @protected
     */
    afterSetMapboxStyle(value, oldValue) {
        let me = this,
            {accessToken, appName, id, windowId} = me;

        me.mounted && Neo.main.addon.MapboxGL.setStyle({
            accessToken,
            appName,
            id,
            style: value,
            windowId
        })
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        let me = this,
            {appName, id, layers, sources, windowId} = me;

        if (value === false && oldValue !== undefined) {
            Neo.main.addon.MapboxGL.destroy({appName, id, windowId})
        }

        super.afterSetMounted(value, oldValue);

        if (value) {
            const opts = {
                accessToken: me.accessToken,
                appName,
                center     : me.center,
                id,
                mapboxStyle: me.mapboxStyle,
                zoom       : me.zoom,
                windowId
            };

            if (me.chartData) {
                opts.data         = me.chartData;
                opts.dataSourceId = me.dataSourceId
            }

            if (layers) {
                opts.layers = layers
            }

            if (sources) {
                opts.sources = sources
            }

            Neo.main.addon.MapboxGL.create(opts).then(me.onMapMounted)
        }
    }

    /**
     * Triggered after the sources config got changed
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetSources(value, oldValue) {
        if (value) {
            let {appName, id, windowId} = this;

            Neo.main.addon.MapboxGL.addSources({
                appName,
                id,
                sources: value,
                windowId
            })
        }
    }

    /**
     * Triggered after the zoom config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetZoom(value, oldValue) {
        if (this.mounted) {
            let {appName, id, windowId} = this;

            Neo.main.addon.MapboxGL.zoom({
                appName,
                id,
                zoom: value,
                windowId
            })
        }
    }

    /**
     *
     */
    autoResize() {
        let {appName, id, windowId} = this;

        Neo.main.addon.MapboxGL.autoResize({
            appName,
            id,
            windowId
        })
    }

    /**
     * Triggered before the center config gets changed.
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    beforeSetCenter(value, oldValue) {
        if (value && value.long) {
            value.lng = value.long;
            delete value.long
        }

        return value
    }

    /**
     * Triggered before the chartData config gets changed.
     * @param {Array|null} value
     * @param {Array|null} oldValue
     * @protected
     */
    beforeSetChartData(value, oldValue) {
        if (value && this.convertDataToGeoJson) {
            value = this.convertToGeoJson(value)
        }

        return value
    }

    /**
     * Use component.center = {} or component.flyTo() instead
     * @param {Object} value
     * @param {Number} value.lat
     * @param {Number} value.lng
     * @param {Boolean} animate=false
     * @protected
     */
    centerMap(value, animate=false) {
        let {appName, id, windowId} = this;

        Neo.main.addon.MapboxGL.center({
            animate,
            appName,
            id,
            lat: value.lat,
            lng: value.lng,
            windowId
        })
    }

    /**
     * @param {Object[]} data
     * @returns {Object} Object matching the geojson format
     */
    convertToGeoJson(data) {
        const geoJson = {
            type    : 'FeatureCollection',
            features: []
        };

        data.forEach(item => {
            // todo: this needs to get more generic
            geoJson.features.push({
                type: 'Feature',

                properties: {
                    active   : item.active,
                    cases    : item.cases,
                    deaths   : item.deaths,
                    id       : item.countryInfo.iso2,
                    recovered: item.recovered,
                    time     : item.updated
                },

                geometry: {
                    type       : 'Point',
                    coordinates: [item.countryInfo.long, item.countryInfo.lat]
                }
            })
        });

        return geoJson
    }

    /**
     * @param {Object} value
     * @param {Number} value.lat
     * @param {Number} value.lng
     */
    flyTo(value) {
        let me = this;

        value = me.beforeSetCenter(value, null); // long => lng if needed

        me._center = {lat: value.lat, lng: value.lng}; // silent update

        me.centerMap(value, true)
    }

    /**
     *
     */
    getVdomRoot() {
        return this.vdom.cn[0].cn[0]
    }

    /**
     *
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0].childNodes[0]
    }

    /**
     * Override this method to trigger logic after the map got mounted into the dom
     */
    onMapMounted() {

    }

    /**
     * @param {Object} data
     * @param {String} data.layerId
     * @param {Object} data.options
     * @param {Boolean} data.options.validate = true
     * @param {Array} data.value
     */
    setFilter(data) {
        let {appName, id, windowId}   = this,
            {layerId, options, value} = data;

        Neo.main.addon.MapboxGL.setFilter({
            appName,
            id,
            layerId,
            options,
            value,
            windowId
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.layerId
     * @param {String} data.key
     * @param {Object} data.options
     * @param {Boolean} data.options.validate = true
     * @param {String} data.value
     */
    setLayoutProperty(data) {
        let {appName, id, windowId}        = this,
            {key, layerId, options, value} = data;

        Neo.main.addon.MapboxGL.setLayoutProperty({
            appName,
            id,
            key,
            layerId,
            options,
            value,
            windowId
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.layerId
     * @param {String} data.key
     * @param {Object} data.options
     * @param {Boolean} data.options.validate = true
     * @param {String} data.value
     */
    setPaintProperty(data) {
        let {appName, id, windowId}        = this,
            {key, layerId, options, value} = data;

        Neo.main.addon.MapboxGL.setPaintProperty({
            appName,
            id,
            key,
            layerId,
            options,
            value,
            windowId
        })
    }
}

Neo.setupClass(MapboxGL);

export default MapboxGL;
