import Addon      from './Base.mjs';
import DomAccess  from '../DomAccess.mjs';
import DomEvents  from '../DomEvents.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * In development: Do not use inside your apps until the implementation is finished.
 * @class Neo.main.addon.OpenLayers
 * @extends Neo.main.addon.Base
 * @mixes Neo.core.Observable
 * @experimental
 */
class OpenLayers extends Addon {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.main.addon.OpenLayers'
         * @protected
         */
        className: 'Neo.main.addon.OpenLayers',
        /**
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'addMarker',
                'create',
                'destroyMarkers',
                'geocode',
                'hideMarker',
                'panTo',
                'removeMap',
                'removeMarker',
                'setCenter',
                'setZoom',
                'showMarker'
            ]
        }
    }

    /**
     * @member {Object} maps={}
     */
    maps = {}
    /**
     * @member {Object} markers={}
     */
    markers = {}
    /**
     * @member {Object} vectorLayers={}
     */
    vectorLayers = {}
    /**
     * @member {Object} vectorSources={}
     */
    vectorSources = {}

    /**
     * @param {Object} data
     * @param {Object} [data.anchorPoint] x & y
     * @param {String} [data.icon]
     * @param {String} data.id
     * @param {String} [data.label]
     * @param {String} data.mapId
     * @param {Object} data.position
     * @param {String} [data.title]
     */
    addMarker(data) {
        // TODO: Implement OpenLayers marker creation
    }

    /**
     * @param {Object} data
     * @param {Object} data.center
     * @param {Boolean} data.fullscreenControl
     * @param {String} data.id
     * @param {Object} data.mapOptions
     * @param {Number} data.maxZoom
     * @param {Number} data.minZoom
     * @param {Number} data.zoom
     * @param {Boolean} data.zoomControl
     */
    create(data) {
        // TODO: Implement OpenLayers map creation
    }

    /**
     * @param {Object} data
     * @param {String} data.mapId
     */
    destroyMarkers(data) {
        // TODO: Implement marker destruction
    }

    /**
     * @param {Object} data
     * @param {String} data.address
     * @param {Object} data.location
     * @param {String} data.placeId
     * @returns {Object}
     */
    async geocode(data) {
        // TODO: Implement geocoding (likely using Nominatim or other service)
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    hideMarker(data) {
        // TODO: Implement marker hiding
    }

    /**
     * @protected
     */
    async loadFiles() {
        // TODO: Load OpenLayers CSS and JS files
    }

    /**
     * @param {ol.Map} map
     * @param {String} mapId
     */
    onMapZoomChange(map, mapId) {
        // TODO: Handle zoom change events
    }

    /**
     * @param {ol.Feature} feature
     * @param {Object} event
     */
    onMarkerClick(feature, event) {
        // TODO: Handle marker click events
    }

    /**
     * @param {Object} data
     * @param {String} data.mapId
     * @param {Object} data.position
     */
    panTo(data) {
        // TODO: Implement pan to position
    }

    /**
     * @param {Object} data
     * @param {String} data.mapId
     */
    removeMap(data) {
        // TODO: Implement map removal
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    removeMarker(data) {
        // TODO: Implement marker removal
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Object} data.value
     */
    setCenter(data) {
        // TODO: Implement set center
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Number} data.value
     */
    setZoom(data) {
        // TODO: Implement set zoom
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    showMarker(data) {
        // TODO: Implement marker showing
    }
}

export default Neo.setupClass(OpenLayers);
