import GoogleMapsComponent      from '../../../../node_modules/neo.mjs/src/component/wrapper/GoogleMaps.mjs';
import MapComponentController   from "./MapComponentController.mjs";
import MarkerPopup             from "./MarkerPopup.mjs";

/**
 * @class Neo.examples.component.wrapper.googleMaps.MapComponent
 * @extends Neo.component.wrapper.GoogleMaps
 */
class MapComponent extends GoogleMapsComponent {
    static getConfig() {return {
        className: 'Neo.examples.component.wrapper.googleMaps.MapComponent',
        ntype: 'worldmap',

        controller: MapComponentController,

        // Center the map initially to Island
        center: {
            lat: 64.963051,
            lng: -19.020835
        },

        // Ensure only Island is visible
        zoom: 6,

        // Adding record to keep the original data
        markerStore: {
            model: {
                fields: [{
                    name: 'id',
                    type: 'Number'
                }, {
                    name: 'icon',
                    type: 'Object'
                }, {
                    name: 'position',
                    type: 'Object'
                }, {
                    name: 'record',
                    type: 'Object'
                }, {
                    name: 'title',
                    type: 'String'
                }]
            }
        },

        onMarkerClick(data) {
            let me = this,
                record = data.record.record,
                event = data.event;

            me.disabled = true;

            me.dialog = Neo.create(MarkerPopup, {
                appName             : me.appName,
                record              : record,
                domEvent            : data.domEvent,
                boundaryContainerId : me.id
            });
        },

        // todo Not working
        // listeners: {
        //     zoomChange: 'onMapZoomChance'
        // }
    }}

    construct(config) {
        super.construct(config);

        this.fetchData();
    }

    /**
     * Ajax request to get the Marker Data
     */
    fetchData() {
        let me  = this,
            url = '../../../../examples/component/wrapper/googleMaps/earthquakes.json',
            callbackFn = me.createMarkersAndAddToMarkerStore.bind(me);

        fetch(url)
            .then(response => response.json())
            .catch(err => console.log("Can't access  + url, err"))
            .then(data => callbackFn(data));
    }

    /**
     * Create Marker records from the Server result and
     * push all Markers to the MarkerStore
     *
     * @param {Object} data     from earthquake.json
     */
    createMarkersAndAddToMarkerStore (data) {
        let me = this;

        const markers = data.results.map(function(record) {
            const date = new Date(record.timestamp),
                // DATE
                day = date.toLocaleDateString('en-US', { day: 'numeric' }),
                month = date.toLocaleDateString('en-US', { month: 'short' }),
                year = date.toLocaleDateString('en-US', { year: 'numeric' }),
                hour = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
                minute = date.toLocaleTimeString('en-US', { minute: 'numeric' }),
                // ICON
                icon = me.getIcon(undefined, undefined, record.size);

            // Create a single Marker
            return {
                position: {
                    lat: record.latitude,
                    lng: record.longitude
                },
                title: `${day}, ${month} ${year}\n[${hour}:${minute}] ${record.humanReadableLocation}`,
                record: record,
                icon: icon
            }
        });

        // Add to MarkerStore
        me.markerStore.add(markers);
    }

    /**
     * google.maps.SymbolPaths are not available in the worker.
     * Therefore we are solving it here
     *
     * @param {String} symbol
     * @returns {Number}
     */
    getType(symbol) {
        // google.maps.SymbolPath...
        const symbolPaths = {
            "CIRCLE": 0,
            "FORWARD_CLOSED_ARROW": 1,
            "FORWARD_OPEN_ARROW": 2,
            "BACKWARD_CLOSED_ARROW": 3,
            "BACKWARD_OPEN_ARROW": 4
        }

        return symbolPaths[symbol]
    }

    /**
     * Create an icon based on color, symbol and size
     *
     * @param {String} [color=red]
     * @param {'CIRCLE' | 'FORWARD_CLOSED_ARROW' | 'FORWARD_OPEN_ARROW' | 'BACKWARD_CLOSED_ARROW' | 'BACKWARD_OPEN_ARROW'} [symbol=CIRCLE]
     * @param {Number} [scaleMultiplier=1]
     * @returns {{fillColor: string, path: Number, fillOpacity: number, strokeWeight: number, scale: number, strokeColor: string}}
     */
    getIcon(color='red', symbol = 'CIRCLE', scaleMultiplier = 1) {
        const path = this.getType(symbol);

        return {
            path: path,
            scale: 10 * scaleMultiplier,
            strokeColor: `dark${color}`,
            strokeWeight: 2,
            fillColor: color,
            fillOpacity: 1.0
        }
    }
}

Neo.applyClassConfig(MapComponent);

export default MapComponent;
