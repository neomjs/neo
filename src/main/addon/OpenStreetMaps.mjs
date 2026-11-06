import Base       from './Base.mjs';
import DomAccess  from '../DomAccess.mjs';
import DomEvents  from '../DomEvents.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * The pin a marker shows when its record names no icon: red, with its tip at the marker's position.
 * @type {String}
 */
const defaultMarkerIcon = 'data:image/svg+xml;base64,' + btoa(
    '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    '<path fill="#FF0000" stroke="#FFFFFF" stroke-width="2" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>' +
    '<circle fill="#FFFFFF" cx="12" cy="9" r="3"/>' +
    '</svg>'
);

/**
 * @summary Main thread addon that renders OpenStreetMap tiles through OpenLayers, keyless, with the marker API
 * of `Neo.main.addon.GoogleMaps`.
 *
 * Each map owns one vector source, and a marker is an `ol.Feature` in it. `markers[mapId][id]` keeps a hidden
 * marker, so showing it again needs no new record. The wrapper component `Neo.component.wrapper.OpenStreetMaps`
 * listens for the `openStreetMapZoomChange` and `openStreetMapMarkerClick` messages this addon sends.
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
     * The `ol.Feature` of each marker, by map id and marker id, also while it is hidden
     * @member {Object} markers={}
     */
    markers = {}
    /**
     * The `ol.source.Vector` holding the visible markers of each map, by map id
     * @member {Object} vectorSources={}
     */
    vectorSources = {}

    /**
     * @summary Adds or replaces a marker on the specified map, deferring until `mapCreated` if the map is not yet
     * initialized.
     * @param {Object} data
     * @param {Object} [data.anchorPoint] x & y in px, measured from the icon's top left corner
     * @param {Object|String} [data.icon] The icon URL, or an object with a `url`
     * @param {String} data.id
     * @param {String} [data.label]
     * @param {String} data.mapId
     * @param {Object} data.position lat & lng
     * @param {String} [data.title] Shown while the pointer rests on the marker
     */
    addMarker(data) {
        let me      = this,
            {mapId} = data,
            feature, listenerId;

        if (!me.maps[mapId]) {
            listenerId = me.on('mapCreated', id => {
                if (mapId === id) {
                    me.un(listenerId);
                    me.addMarker(data)
                }
            });

            return
        }

        me.removeMarker(data);

        Neo.ns(`${mapId}`, true, me.markers);

        feature = new ol.Feature({
            geometry: new ol.geom.Point([data.position.lng, data.position.lat]),
            neoId   : data.id, // custom property
            neoMapId: mapId,   // custom property
            title   : data.title
        });

        feature.setStyle(me.createMarkerStyle(data));

        me.markers[mapId][data.id] = feature;
        me.vectorSources[mapId].addFeature(feature)
    }

    /**
     * @summary Creates the map with a tile layer and a marker layer, then fires `mapCreated`.
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
        let me          = this,
            {id: mapId} = data,
            map, mapElement, vectorSource, view;

        // Ensure OpenLayers is loaded first (Remote Method Interception pattern)
        if (!globalThis.ol) {
            await me.loadFiles()
        }

        mapElement = mapId && DomAccess.getElement(mapId);

        if (!mapElement) {
            console.error(`Map container element with id "${mapId}" not found`);
            return {success: false, error: 'Map container not found', mapId}
        }

        try {
            vectorSource = new ol.source.Vector();

            // No projection needed: loadFiles() switched OpenLayers to geographic coordinates
            view = new ol.View({
                center : [data.center.lng, data.center.lat],
                maxZoom: data.maxZoom ?? 28,
                minZoom: data.minZoom ?? 0,
                zoom   : data.zoom    ?? 10
            });

            map = new ol.Map({
                controls: me.createControls(data),
                layers  : [new ol.layer.Tile({source: new ol.source.OSM()}), new ol.layer.Vector({source: vectorSource})],
                target  : mapElement,
                view
            });

            // The zoom the app worker knows, so only a change reports back
            map.set('neoZoom', view.getZoom());

            me.maps[mapId]          = map;
            me.vectorSources[mapId] = vectorSource;

            map.on('click',       event => me.onMapClick(map, event));
            map.on('moveend',     ()    => me.onMapZoomChange(map, mapId));
            map.on('pointermove', event => me.onPointerMove(map, event));

            me.fire('mapCreated', mapId);

            return {success: true, mapId}
        } catch (error) {
            console.error(`Failed to create OpenStreetMaps map "${mapId}":`, error);
            return {success: false, error: error.message, mapId}
        }
    }

    /**
     * @summary The map's controls. The attribution always shows, since the OpenStreetMap tile license requires
     * it. Zoom buttons show unless `zoomControl` is false, as in `Neo.main.addon.GoogleMaps`.
     * @param {Object} data The create() payload
     * @param {Boolean} [data.fullscreenControl]
     * @param {Boolean} [data.zoomControl]
     * @returns {ol.control.Control[]}
     * @protected
     */
    createControls({fullscreenControl, zoomControl}) {
        let controls = [new ol.control.Attribution()];

        zoomControl !== false && controls.push(new ol.control.Zoom());
        fullscreenControl     && controls.push(new ol.control.FullScreen());

        return controls
    }

    /**
     * @summary The style of one marker: a circle symbol, its icon or the default pin, and its label as text.
     *
     * An icon object without a `url` is read as a Google Maps symbol, so marker records written for
     * `Neo.main.addon.GoogleMaps` render here too. `path` 0 is `google.maps.SymbolPath.CIRCLE`: a circle `scale`
     * px in radius, at least 1px. Like Google, an unset `fillOpacity` leaves the fill transparent. The arrow paths
     * fall back to the default pin.
     * @param {Object} data The addMarker() payload
     * @param {Object} [data.anchorPoint]
     * @param {Object|String} [data.icon]
     * @param {String} [data.label]
     * @returns {ol.style.Style}
     * @protected
     */
    createMarkerStyle({anchorPoint, icon, label}) {
        let isCircle = icon?.path === 0,
            units    = anchorPoint ? 'pixels' : 'fraction',
            fill, image, rgb;

        if (isCircle) {
            rgb   = ol.color.asArray(icon.fillColor || 'black').slice(0, 3);
            fill  = new ol.style.Fill({color: [...rgb, icon.fillOpacity ?? 0]});
            image = new ol.style.Circle({
                fill,
                // A radius below 1px throws inside the canvas renderer, and with it the whole map's frame
                radius: Math.max(1, icon.scale ?? 10),
                stroke: icon.strokeColor ? new ol.style.Stroke({color: icon.strokeColor, width: icon.strokeWeight || 1}) : undefined
            })
        } else {
            image = new ol.style.Icon({
                anchor      : anchorPoint ? [anchorPoint.x, anchorPoint.y] : [0.5, 1],
                anchorXUnits: units,
                anchorYUnits: units,
                src         : (typeof icon === 'string' ? icon : icon?.url) || defaultMarkerIcon
            })
        }

        return new ol.style.Style({
            image,
            // Centered on a circle, on the pin's head otherwise
            text: label ? new ol.style.Text({offsetY: isCircle ? 0 : -15, text: String(label)}) : undefined
        })
    }

    /**
     * @summary Destroys all markers for the specified map ID.
     * @param {Object} data
     * @param {String} [data.id]
     * @param {String} [data.mapId]
     */
    destroyMarkers(data) {
        let me    = this,
            mapId = data.mapId || data.id;

        me.vectorSources[mapId]?.clear();
        delete me.markers[mapId]
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
     * @summary Takes a marker off the map and keeps it for showMarker().
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    hideMarker(data) {
        let feature = this.markers[data.mapId]?.[data.id],
            source  = this.vectorSources[data.mapId];

        feature && source?.hasFeature(feature) && source.removeFeature(feature)
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
     * @summary The topmost marker at a pixel, if any. Tile layers carry no features, so a hit is a marker.
     * @param {ol.Map} map
     * @param {Number[]} pixel
     * @returns {ol.Feature|null}
     * @protected
     */
    markerAtPixel(map, pixel) {
        return map.forEachFeatureAtPixel(pixel, feature => feature.get('neoId') === undefined ? undefined : feature) || null
    }

    /**
     * @summary Reports a click on a marker. Only the topmost marker under the pointer counts.
     * @param {ol.Map} map
     * @param {ol.MapBrowserEvent} event
     * @protected
     */
    onMapClick(map, event) {
        let feature = this.markerAtPixel(map, event.pixel);

        feature && this.onMarkerClick(feature, event)
    }

    /**
     * @summary Tells the app worker the zoom level once a view change ends, if the level changed. Reporting per
     * frame would let the wrapper's `setZoom()` restart the animation that is still running.
     * @param {ol.Map} map
     * @param {String} mapId
     */
    onMapZoomChange(map, mapId) {
        let zoom = map.getView().getZoom();

        if (zoom !== map.get('neoZoom')) {
            map.set('neoZoom', zoom);

            DomEvents.sendMessageToApp({
                id   : mapId,
                path : [{cls: [], id: mapId}],
                type : 'openStreetMapZoomChange',
                value: zoom
            })
        }
    }

    /**
     * @param {ol.Feature} feature
     * @param {ol.MapBrowserEvent} event
     */
    onMarkerClick(feature, event) {
        DomEvents.sendMessageToApp({
            domEvent: DomEvents.getMouseEventData(event.originalEvent),
            id      : feature.get('neoId'),
            path    : [{cls: [], id: feature.get('neoMapId')}],
            type    : 'openStreetMapMarkerClick'
        })
    }

    /**
     * @summary Shows the marker's title as a tooltip and a pointer cursor while the pointer rests on a marker.
     * Both live on OpenLayers' own viewport element, never on the component's node.
     * @param {ol.Map} map
     * @param {ol.MapBrowserEvent} event
     * @protected
     */
    onPointerMove(map, event) {
        let feature  = event.dragging ? null : this.markerAtPixel(map, event.pixel),
            viewport = map.getViewport();

        viewport.title        = feature?.get('title') || '';
        viewport.style.cursor = feature ? 'pointer' : ''
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
                center,
                duration,
                easing: ol.easing.easeOut
            });

            return {
                success: true,
                mapId,
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
     * @summary Detaches the map from its node and releases it with its markers. A remounted wrapper creates a
     * new map.
     * @param {Object} data
     * @param {String} data.mapId
     */
    removeMap(data) {
        let me      = this,
            {mapId} = data,
            map     = me.maps[mapId];

        if (map) {
            map.setTarget(undefined);
            map.dispose()
        }

        delete me.maps[mapId];
        delete me.markers[mapId];
        delete me.vectorSources[mapId]
    }

    /**
     * @summary Removes a marker for good. Removing an unknown marker does nothing.
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    removeMarker(data) {
        let me      = this,
            markers = me.markers[data.mapId];

        if (markers?.[data.id]) {
            me.hideMarker(data);
            delete markers[data.id]
        }
    }

    /**
     * @summary Centers the map on a position without animation.
     * @param {Object} data
     * @param {String} data.id The map id
     * @param {Object} data.value lat & lng
     */
    setCenter(data) {
        this.maps[data.id].getView().setCenter([data.value.lng, data.value.lat])
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
                duration,
                easing: ol.easing.easeOut
            });

            return {
                success: true,
                mapId,
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
     * @summary Puts a hidden marker back on the map.
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    showMarker(data) {
        let feature = this.markers[data.mapId]?.[data.id],
            source  = this.vectorSources[data.mapId];

        feature && source && !source.hasFeature(feature) && source.addFeature(feature)
    }
}

export default Neo.setupClass(OpenStreetMaps);
