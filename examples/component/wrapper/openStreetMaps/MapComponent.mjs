import OpenStreetMapsComponent from '../../../../src/component/wrapper/OpenStreetMaps.mjs';
import MarkerDialog        from './MarkerDialog.mjs';

/**
 * @class Neo.examples.component.wrapper.OpenStreetMaps.MapComponent
 * @extends Neo.component.wrapper.OpenStreetMaps
 */
class MapComponent extends OpenStreetMapsComponent {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.wrapper.OpenStreetMaps.MapComponent'
         * @protected
         */
        className: 'Neo.examples.component.wrapper.OpenStreetMaps.MapComponent',
        /**
         * Center the map initially to Iceland
         * @member {Object} center={lat: 64.963051,lng: -19.020835}
         * @reactive
         */
        center: {
            lng: -19.020835,
            lat: 64.963051
        },
        /**
         * Adding a record field
         * @member {Object} markerStore
         * @protected
         */
        markerStore: {
            model: {
                fields: [{
                    name: 'anchorPoint',
                    type: 'Object'
                }, {
                    name: 'icon',
                    type: 'Object'
                }, {
                    name: 'id'
                }, {
                    name: 'label',
                    type: 'String'
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
        /**
         * Limit zoom to prevent over-zooming beyond useful detail
         * @member {Number} maxZoom=18
         * @reactive
         */
        maxZoom: 18,
        /**
         * Ensure only Iceland is visible
         * @member {Number} zoom=6
         * @reactive
         */
        zoom: 6
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.fetchData()
    }

    /**
     * Ajax request to get the Marker Data
     */
    fetchData() {
        fetch('../../../../examples/component/wrapper/openStreetMaps/earthquakes.json')
            .then(response => response.json())
            .catch(err => console.log("Can't access  + url, err"))
            .then(data => this.createMarkersAndAddToMarkerStore(data))
    }

    /**
     * Create Marker records from the Server result and add all Markers to the MarkerStore
     * @param {Object} data from earthquake.json
     */
    createMarkersAndAddToMarkerStore(data) {
        let date, icon;

        const markers = data.results.map(record => {
            date = new Date(record.timestamp).toLocaleDateString('default', {
                day   : 'numeric',
                hour  : 'numeric',
                hour12: true,
                minute: 'numeric',
                month : 'short',
                year  : 'numeric'
            });

            icon = this.getIcon(undefined, undefined, record.size);

            // Create a single Marker
            return {
                icon,
                position: {lng: record.longitude, lat: record.latitude}, //openlayers expects lng/lat
                record,
                title   : `${date}, ${record.humanReadableLocation}`
            }
        });

        this.markerStore.add(markers)
    }
    //TODO this might be an AI hallucination
    /**
     * osm.maps.SymbolPaths are not available in the worker.
     * Therefore, we are solving it here
     * @param {String} symbol
     * @returns {Number}
     */
    getType(symbol) {
        return {
            'CIRCLE'               : 0,
            'FORWARD_CLOSED_ARROW' : 1,
            'FORWARD_OPEN_ARROW'   : 2,
            'BACKWARD_CLOSED_ARROW': 3,
            'BACKWARD_OPEN_ARROW'  : 4
        }[symbol]
    }

    /**
     * Create an icon based on color, symbol and size
     * @param {String} color=red
     * @param {'CIRCLE' | 'FORWARD_CLOSED_ARROW' | 'FORWARD_OPEN_ARROW' | 'BACKWARD_CLOSED_ARROW' | 'BACKWARD_OPEN_ARROW'} [symbol=CIRCLE]
     * @param {Number} scaleMultiplier=1
     * @returns {{fillColor: string, path: Number, fillOpacity: number, strokeWeight: number, scale: number, strokeColor: string}}
     */
    getIcon(color='red', symbol='CIRCLE', scaleMultiplier=1) {
        return {
            fillColor   : color,
            fillOpacity : 1.0,
            path        : this.getType(symbol),
            scale       : 10 * scaleMultiplier,
            strokeColor : `dark${color}`,
            strokeWeight: 2
        }
    }

    /**
     * @param {Object} data
     */
    onMarkerClick(data) {
        let me     = this,
            record = data.record.record;

        me.disabled = true;

        me.dialog = Neo.create(MarkerDialog, {
            appName             : me.appName,
            boundaryContainerId : me.id,
            domEvent            : data.domEvent,
            record,

            listeners: {
                close: () => me.disabled = false
            }
        })
    }
}

export default Neo.setupClass(MapComponent);
