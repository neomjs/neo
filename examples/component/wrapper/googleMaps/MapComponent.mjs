import GoogleMapsComponent from '../../../../src/component/wrapper/GoogleMaps.mjs';
import MarkerDialog        from './MarkerDialog.mjs';

/**
 * @class Neo.examples.component.wrapper.googleMaps.MapComponent
 * @extends Neo.component.wrapper.GoogleMaps
 */
class MapComponent extends GoogleMapsComponent {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.wrapper.googleMaps.MapComponent'
         * @protected
         */
        className: 'Neo.examples.component.wrapper.googleMaps.MapComponent',
        /**
         * Center the map initially to Island
         * @member {Object} center={lat: 64.963051,lng: -19.020835}
         */
        center: {
            lat: 64.963051,
            lng: -19.020835
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
         * Ensure only Island is visible
         * @member {Number} zoom=6
         */
        zoom: 6
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.fetchData();
    }

    /**
     * Ajax request to get the Marker Data
     */
    fetchData() {
        fetch('../../../../examples/component/wrapper/googleMaps/earthquakes.json')
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
                position: {lat: record.latitude, lng: record.longitude},
                record,
                title   : `${date}, ${record.humanReadableLocation}`
            }
        });

        this.markerStore.add(markers)
    }

    /**
     * google.maps.SymbolPaths are not available in the worker.
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

Neo.applyClassConfig(MapComponent);

export default MapComponent;
