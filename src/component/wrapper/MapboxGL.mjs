import Component from '../Base.mjs';

/**
 * Convenience class to render Mapbox GL maps
 * Requires setting Neo.config.useMapboxGL to true (or manually include the lib)
 * @class Neo.component.wrapper.MapboxGL
 * @extends Neo.component.Base
 */
class MapboxGL extends Component {
    static getConfig() {return {
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
         * @member {Object} center_={lat: 0, lng: 0}
         */
        center_: {lat: 0, lng: 0},
        /**
         * @member {Boolean} convertDataToGeoJson=true
         * @protected
         */
        convertDataToGeoJson: true,
        /**
         * @member {Array|null} data_=null
         */
        data_: null,
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
        _vdom: {
            style: {position: 'relative', height: '100%', width: '100%'},
            cn: [{
                style: {position: 'absolute', height: '100%', width: '100%'},
                cn: [{
                    style: { height: '100%'}
                }]
            }]
        },
        /**
         *
         * @member {Number} zoom_=3
         */
        zoom_: 3
    }}

    /**
     * Triggered after the center config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetCenter(value, oldValue) {
        this.centerMap(value);
    }

    /**
     * Triggered after the data config got changed
     * @param {Array|null} value
     * @param {Array|null} oldValue
     * @protected
     */
    afterSetData(value, oldValue) {
        let me = this;

        if (value) {
            Neo.main.addon.MapboxGL.updateData({
                appName     : me.appName,
                data        : value,
                dataSourceId: me.dataSourceId,
                id          : me.id
            });
        }
    }

    /**
     * Triggered after the layers config got changed
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetLayers(value, oldValue) {
        if (value) {
            Neo.main.addon.MapboxGL.addLayers({
                appName: this.appName,
                id     : this.id,
                layers : value
            });
        }
    }

    /**
     * Triggered after the mapboxStyle config got changed
     * @param {Object|String} value
     * @param {Object|String} oldValue
     * @protected
     */
    afterSetMapboxStyle(value, oldValue) {
        let me = this;

        if (this.mounted) {
            Neo.main.addon.MapboxGL.setStyle({
                accessToken: me.accessToken,
                appName    : me.appName,
                id         : me.id,
                style      : value
            });
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        let me = this;

        if (value === false && oldValue !== undefined) {
            Neo.main.addon.MapboxGL.destroy({
                appName: me.appName,
                id     : me.id
            });
        }

        super.afterSetMounted(value, oldValue);

        if (value) {
            const opts = {
                accessToken: me.accessToken,
                appName    : me.appName,
                center     : me.center,
                id         : me.id,
                mapboxStyle: me.mapboxStyle,
                zoom       : me.zoom
            };

            if (me.data) {
                opts.data         = me.data;
                opts.dataSourceId = me.dataSourceId;
            }

            if (me.layers) {
                opts.layers = me.layers;
            }

            if (me.sources) {
                opts.sources = me.sources;
            }

            Neo.main.addon.MapboxGL.create(opts).then(me.onMapMounted);
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
            Neo.main.addon.MapboxGL.addSources({
                appName: this.appName,
                id     : this.id,
                sources: value
            });
        }
    }

    /**
     * Triggered after the zoom config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetZoom(value, oldValue) {
        let me = this;

        if (me.mounted) {
            Neo.main.addon.MapboxGL.zoom({
                appName: me.appName,
                id     : me.id,
                zoom   : value
            });
        }
    }

    /**
     *
     */
    autoResize() {
        Neo.main.addon.MapboxGL.autoResize({
            appName: this.appName,
            id     : this.id
        });
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
            delete value.long;
        }

        return value;
    }

    /**
     * Triggered before the data config gets changed.
     * @param {Array|null} value
     * @param {Array|null} oldValue
     * @protected
     */
    beforeSetData(value, oldValue) {
        if (value && this.convertDataToGeoJson) {
            value = this.convertToGeoJson(value);
        }

        return value;
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
        Neo.main.addon.MapboxGL.center({
            animate: animate,
            appName: this.appName,
            id     : this.id,
            lat    : value.lat,
            lng    : value.lng
        });
    }

    /**
     *
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

        return geoJson;
    }

    /**
     *
     * @param {Object} value
     * @param {Number} value.lat
     * @param {Number} value.lng
     */
    flyTo(value) {
        const me = this;

        value = me.beforeSetCenter(value, null); // long => lng if needed

        me._center = {lat: value.lat, lng: value.lng}; // silent update

        me.centerMap(value, true);
    }

    /**
     *
     */
    getVdomRoot() {
        return this.vdom.cn[0].cn[0];
    }

    /**
     *
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0].childNodes[0];
    }

    /**
     * Override this method to trigger logic after the map got mounted into the dom
     */
    onMapMounted() {

    }

    /**
     *
     * @param {Object} data
     * @param {String} data.layerId
     * @param {Object} data.options
     * @param {Boolean} data.options.validate = true
     * @param {Array} data.value
     */
    setFilter(data) {
        Neo.main.addon.MapboxGL.setFilter({
            appName: this.appName,
            id     : this.id,
            layerId: data.layerId,
            options: data.options,
            value  : data.value
        });
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.layerId
     * @param {String} data.key
     * @param {Object} data.options
     * @param {Boolean} data.options.validate = true
     * @param {String} data.value
     */
    setLayoutProperty(data) {
        Neo.main.addon.MapboxGL.setLayoutProperty({
            appName: this.appName,
            id     : this.id,
            key    : data.key,
            layerId: data.layerId,
            options: data.options,
            value  : data.value
        });
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.layerId
     * @param {String} data.key
     * @param {Object} data.options
     * @param {Boolean} data.options.validate = true
     * @param {String} data.value
     */
    setPaintProperty(data) {
        Neo.main.addon.MapboxGL.setPaintProperty({
            appName: this.appName,
            id     : this.id,
            key    : data.key,
            layerId: data.layerId,
            options: data.options,
            value  : data.value
        });
    }
}

Neo.applyClassConfig(MapboxGL);

export {MapboxGL as default};