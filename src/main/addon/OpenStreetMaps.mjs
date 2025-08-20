import Base       from './Base.mjs';
import DomAccess  from '../DomAccess.mjs';
import DomEvents  from '../DomEvents.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * @class Neo.main.addon.OpenStreetMaps
 * @extends Neo.main.addon.Base
 * @mixes Neo.core.Observable
 */
class OpenStreetMaps extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.main.addon.OpenStreetMaps'
         * @protected
         */
        className: 'Neo.main.addon.OpenStreetMaps',

        interceptRemotes: ['create'],
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
    async create(data) {
        let me = this,
            {id: mapId} = data,
            map;

        // Ensure OpenLayers is loaded first (Remote Method Interception pattern)
        if (!globalThis.ol) {
            await me.loadFiles();
        }
        // Verify mapId is provided
        if (!mapId) {
            console.error(`Map ID is not provided`);
            return;
        }

        // Before creating the map, verify element dimensions:
        let mapElement = document.getElementById(mapId);
        let styles = window.getComputedStyle(mapElement);

        if (!mapElement) {
            console.error(`Map container element with id "${mapId}" not found`);
            return;
        }
        try {
            const center = [data.center.lng, data.center.lat];

            // Create the view configuration - no projection needed due to useGeographic()
            let viewConfig = {
                center: center,
                zoom: data.zoom || 10,
                minZoom: data.minZoom != undefined ? data.minZoom : 0,
                maxZoom: data.maxZoom != undefined ? data.maxZoom : 28
            };

            // Create the view using CDN global object
            let view = new ol.View(viewConfig);

            // Create base tile layer (OpenStreetMap) using CDN global object
            let tileLayer = new ol.layer.Tile({
                source: new ol.source.OSM()
            });

            // Create controls array
            let controls =[];
            if (data.fullscreenControl) {
                controls.push(new ol.control.FullScreen());
            }

            // // Create vector source and layer for markers using CDN global object
            // let vectorSource = new ol.source.Vector();
            // let vectorLayer = new ol.layer.Vector({
            //     source: vectorSource,
            //     style: me.getDefaultMarkerStyle()
            // });

            // Store vector source and layer for later use
            // me.vectorSources[mapId] = vectorSource;
            // me.vectorLayers[mapId] = vectorLayer;

            // Create the map using CDN global object
            let map = new ol.Map({
                controls: controls,
                target: mapElement,
                layers: [tileLayer],
                view: view
            });

            // Add fullscreen control if requested
            if (data.fullscreenControl) {
                map.addControl(new ol.control.FullScreen());
            }

            // Store the map instance
            me.maps[mapId] = map;
            
            // // Initialize markers object for this map
            // Neo.ns(`${mapId}`, true, me.markers);

            // Set up zoom change event listener
            view.on('change:zoom', () => {
                me.onMapZoomChange(map, mapId);
            });

            // Set up click event listener for markers
            map.on('click', (event) => {
                map.forEachFeatureAtPixel(event.pixel, (feature) => {
                    if (feature.get('neoId')) {
                        me.onMarkerClick(feature, event);
                    }
                });
            });

            // // Fire mapCreated event (similar to GoogleMaps addon)
            // me.fire('mapCreated', mapId);

            return {
                success: true,
                mapId: mapId
            };

        } catch (error) {
            console.error(`Failed to create OpenStreetMaps map "${mapId}":`, error);
            return {
                success: false,
                error: error.message,
                mapId: mapId
            };
        }
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
        await super.loadFiles();

        let version  = Neo.config.openLayersVersion || '10.6.1',
            basePath = Neo.config.openLayersBasePath || `https://cdn.jsdelivr.net/npm/ol@${version}`,
            cssUrl   = `${basePath}/ol.css`,
            jsUrl    = `${basePath}/dist/ol.js`;

        try {
            await Promise.all([
                DomAccess.loadStylesheet(cssUrl),
                DomAccess.loadScript(jsUrl)
            ]);
            
            // Verify OpenLayers loaded successfully
            if (typeof ol === 'undefined' || !ol.Map || !ol.source || !ol.source.OSM) {
                throw new Error('OpenLayers failed to load completely');
            }
            
            // Configure OpenLayers to use geographic coordinates (WGS84) in all API methods
            // This allows us to work with lat/lng directly without manual transformations
            ol.proj.useGeographic();
            
        } catch (error) {
            console.error('Failed to load OpenLayers:', error);
            throw error;
        }
    }

    /**
     * @param {ol.Map} map
     * @param {String} mapId
     */
    onMapZoomChange(map, mapId) {
        let me = this,
            view = map.getView(),
            currentZoom = view.getZoom(),
            center = view.getCenter();
        
        // Center coordinates are already in WGS84 format due to useGeographic()
        let centerLatLng = {
            lng: center[0],
            lat: center[1]
        };

        // Fire zoom change event that apps can listen to
        me.fire('zoomChanged', {
            mapId: mapId,
            zoom: currentZoom,
            center: centerLatLng
        });

        // Store current zoom level for reference
        if (!me.maps[mapId].neoData) {
            me.maps[mapId].neoData = {};
        }
        me.maps[mapId].neoData.currentZoom = currentZoom;
        me.maps[mapId].neoData.currentCenter = centerLatLng;
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
     * @param {Object} data.position - Position object with lat/lng
     * @param {Number} data.position.lat - Latitude
     * @param {Number} data.position.lng - Longitude
     * @param {Number} [data.duration] - Animation duration in milliseconds (default: 1000)
     */
    panTo(data) {
        let me = this,
            {mapId, position, duration = 1000} = data;

        if (!mapId || !me.maps[mapId]) {
            console.error(`Map with id "${mapId}" not found`);
            return {
                success: false,
                error: `Map with id "${mapId}" not found`
            };
        }

        if (!position || (position.lat === undefined || position.lng === undefined )) {
            console.error('Invalid position data. Expected object with lat and lng properties');
            return {
                success: false,
                error: 'Invalid position data'
            };
        }

        try {
            let map = me.maps[mapId],
                view = map.getView();

            // Use position coordinates directly in [lng, lat] format
            // we configured the projection to useGeographic() so that it expects lat/lng instead of the default mercator projection
            let center = [position.lng, position.lat];

            // Animate the pan
            view.animate({
                center: center,
                duration: duration,
                easing: ol.easing.easeOut
            });

            return {
                success: true,
                mapId: mapId,
                position: position
            };

        } catch (error) {
            console.error(`Failed to pan map "${mapId}":`, error);
            return {
                success: false,
                error: error.message,
                mapId: mapId
            };
        }
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
     * @param {String} data.id - Map ID (mapId)
     * @param {Number} data.value - The zoom level to set
     * @param {Number} [data.duration] - Animation duration in milliseconds (default: 1000)
     */
    setZoom(data) {
        let me = this,
            {id: mapId, value: zoomLevel, duration = 1000} = data;

        if (!mapId || !me.maps[mapId]) {
            console.error(`Map with id "${mapId}" not found`);
            return {
                success: false,
                error: `Map with id "${mapId}" not found`
            };
        }

        if (zoomLevel === undefined || typeof zoomLevel !== 'number') {
            console.error('Invalid zoom level. Expected a number');
            return {
                success: false,
                error: 'Invalid zoom level'
            };
        }

        try {
            let map = me.maps[mapId],
                view = map.getView(),
                minZoom = view.getMinZoom(),
                maxZoom = view.getMaxZoom();

            // Validate zoom level is within bounds
            if (minZoom !== undefined && zoomLevel < minZoom) {
                console.warn(`Zoom level ${zoomLevel} is below minimum ${minZoom}, setting to minimum`);
                zoomLevel = minZoom;
            }
            if (maxZoom !== undefined && zoomLevel > maxZoom) {
                console.warn(`Zoom level ${zoomLevel} is above maximum ${maxZoom}, setting to maximum`);
                zoomLevel = maxZoom;
            }

            // Animate the zoom change
            view.animate({
                zoom: zoomLevel,
                duration: duration,
                easing: ol.easing.easeOut
            });

            return {
                success: true,
                mapId: mapId,
                zoom: zoomLevel
            };

        } catch (error) {
            console.error(`Failed to set zoom for map "${mapId}":`, error);
            return {
                success: false,
                error: error.message,
                mapId: mapId
            };
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    showMarker(data) {
        // TODO: Implement marker showing
    }

    /**
     * Get default marker style for OpenLayers
     * @returns {ol.style.Style}
     * @protected
     */
    getDefaultMarkerStyle() {
        return new ol.style.Style({
            image: new ol.style.Icon({
                anchor: [0.5, 1],
                anchorXUnits: 'fraction',
                anchorYUnits: 'fraction',
                src: 'data:image/svg+xml;base64,' + btoa(`
                    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path fill="#FF0000" stroke="#FFFFFF" stroke-width="2" 
                              d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                        <circle fill="#FFFFFF" cx="12" cy="9" r="3"/>
                    </svg>
                `)
            })
        });
    }
}

export default Neo.setupClass(OpenStreetMaps);