import {default as Component} from '../Base.mjs';

/**
 * Convenience class to render an OpenStreetMap
 * Requires setting Neo.config.useOpenStreetMaps to true (or manually include the lib)
 * @class Neo.component.wrapper.OpenStreetMap
 * @extends Neo.component.Base
 */
class OpenStreetMap extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.wrapper.OpenStreetMap'
         * @private
         */
        className: 'Neo.component.wrapper.OpenStreetMap',
        /**
         * @member {String} ntype='openstreetmap'
         * @private
         */
        ntype: 'openstreetmap',
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
         * @private
         */
        convertDataToGeoJson: true,
        /**
         * @member {Array|null} data_=null
         * @private
         */
        data_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            style: {position: 'relative', height: '100%', width: '100%'},
            cn: [{
                style: {position: 'absolute', height: '100%', width: '100%'},
                cn: [{
                    style: {
                        height: '100%'
                    }
                }]
            }]
        }
    }}

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
     *
     */
    onConstructed() {
        super.onConstructed();

        const me = this;

        me.on('mounted', () => {
            Neo.main.lib.OpenStreetMaps.create({
                accessToken: me.accessToken,
                center     : me.center,
                id         : me.id
            }).then(me.onMapMounted);
        });
    }

    /**
     * Triggered after the center config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @private
     */
    afterSetCenter(value, oldValue) {
        Neo.main.lib.OpenStreetMaps.center({
            id : this.id,
            lat: value.lat,
            lng: value.lng
        });
    }

    /**
     * Triggered after the data config got changed
     * @param {Array|null} value
     * @param {Array|null} oldValue
     * @private
     */
    afterSetData(value, oldValue) {
        if (value) {
            Neo.main.lib.OpenStreetMaps.updateData({
                data: value,
                id  : this.id
            });
        }
    }

    /**
     *
     */
    autoResize() {
        Neo.main.lib.OpenStreetMaps.autoResize({
            id: this.id
        });
    }

    /**
     * Triggered before the data config gets changed.
     * @param {Array|null} value
     * @param {Array|null} oldValue
     * @private
     */
    beforeSetData(value, oldValue) {
        if (value && this.convertDataToGeoJson) {
            value = this.convertToGeoJson(value);
        }

        return value;
    }

    /**
     *
     * @param {Array} data
     * @return {Object} Object matching the geojson format
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

        console.log(geoJson);

        return geoJson;
    }

    /**
     * Override this method to trigger logic after the map got mounted into the dom
     */
    onMapMounted() {
        console.log('onMapMounted');
    }
}

Neo.applyClassConfig(OpenStreetMap);

export {OpenStreetMap as default};