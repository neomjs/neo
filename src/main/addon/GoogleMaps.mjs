import Base       from './Base.mjs';
import DomAccess  from '../DomAccess.mjs';
import DomEvents  from '../DomEvents.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * The global the Maps bootstrap invokes once `google.maps` is populated. It is a flat name because
 * Google resolves this parameter as a path on `globalThis`, and the addon is a main thread singleton,
 * so one name per window cannot collide.
 * @type {String}
 */
const readyCallbackName = 'neoGoogleMapsApiLoaded';

/**
 * @class Neo.main.addon.GoogleMaps
 * @extends Neo.main.addon.Base
 * @mixes Neo.core.Observable
 */
class GoogleMaps extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.main.addon.GoogleMaps'
         * @protected
         */
        className: 'Neo.main.addon.GoogleMaps',
        /**
         * Remote calls arriving before `isReady` are cached instead of executed, which is what keeps
         * them from touching `google` before `loadFiles()` has populated it.
         *
         * Only methods that dereference the `google` global on entry belong here. `create` and
         * `geocode` both do (`new google.maps.Map`, `new google.maps.Geocoder`). `addMarker` also
         * names `google.maps.Marker`, but reaches it only after its own `mapCreated` listener has
         * fired, so it already waits; the rest operate on `me.maps[mapId]`, which cannot exist before
         * `create` has run.
         *
         * `Neo.main.addon.OpenStreetMaps` declares `['create']` for the same reason — its `geocode`
         * is an unimplemented stub, so it is silent on that method rather than excluding it.
         * @member {String[]} interceptRemotes
         * @protected
         */
        interceptRemotes: ['create', 'geocode'],
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
     * @member {google.maps.Geocoder|null} maps=null
     */
    geoCoder = null
    /**
     * @member {Object} maps={}
     */
    maps = {}
    /**
     * @member {Object} markers={}
     */
    markers = {}

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
        let me      = this,
            {mapId} = data,
            listenerId, marker;

        if (!me.maps[mapId]) {
            listenerId = me.on('mapCreated', id => {
                if (mapId === id) {
                    me.un(listenerId);
                    me.addMarker(data)
                }
            })
        } else {
            Neo.ns(`${mapId}`, true, me.markers);

            me.markers[mapId][data.id] = marker = new google.maps.Marker({
                icon    : data.icon,
                label   : data.label,
                map     : me.maps[mapId],
                neoId   : data.id, // custom property
                neoMapId: mapId,   // custom property
                position: data.position,
                title   : data.title,
            });

            marker.addListener('click', me.onMarkerClick.bind(me, marker))
        }
    }

    /**
     * @param {Object} data
     * @param {Object} data.center
     * @param {Boolean} data.fullscreenControl
     * @param {String} data.id
     * @param {Object} data.mapOptions // Pass any options which are not explicitly defined here
     * @param {Number} data.maxZoom
     * @param {Number} data.minZoom
     * @param {Number} data.zoom
     * @param {Boolean} data.zoomControl
     */
    create(data) {
        let me   = this,
            {id} = data,
            map;

        me.maps[id] = map = new google.maps.Map(DomAccess.getElement(id), {
            center           : data.center,
            fullscreenControl: data.fullscreenControl,
            maxZoom          : data.maxZoom,
            minZoom          : data.minZoom,
            zoom             : data.zoom,
            zoomControl      : data.zoomControl,
            ...data.mapOptions
        });

        map.addListener('zoom_changed', me.onMapZoomChange.bind(me, map, id));

        me.fire('mapCreated', id)
    }

    /**
     * Destroys all markers for the specified map ID.
     * @param {Object} data
     * @param {String} data.mapId
     */
    destroyMarkers(data) {
        let me      = this,
            markers = me.markers[data.mapId] || {};

        Object.values(markers).forEach(marker => marker.setMap(null));
        delete me.markers[data.mapId]
    }

    /**
     * Use either address, location or placeId
     * @param {Object} data
     * @param {String} data.address
     * @param {Object} data.location
     * @param {String} data.placeId
     * @returns {Object}
     */
    async geocode(data) {
        let me = this,
            response;

        if (!me.geoCoder) {
            me.geoCoder = new google.maps.Geocoder()
        }

        response = await me.geoCoder.geocode(data);

        return JSON.parse(JSON.stringify(response))
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    hideMarker(data) {
        this.markers[data.mapId][data.id].setMap(null)
    }

    /**
     * @summary Loads the Maps API and resolves only once `google.maps` is populated.
     *
     * The URL returns a BOOTSTRAP STUB, not the API. The script's `load` event fires when that stub
     * finishes downloading, while `google.maps` appears only after the stub's own asynchronous fetch
     * completes and calls the function named by `callback`. Awaiting `DomAccess.loadScript` alone
     * therefore resolves too early, `Base#executeLoadFiles` marks the addon ready, and the first
     * `create()` throws `ReferenceError: google is not defined`.
     *
     * So the awaited promise is settled by the callback, and `loadScript` contributes only its
     * rejection path — a dead network still fails rather than hanging.
     * @protected
     * @returns {Promise<void>}
     */
    async loadFiles() {
        let key = Neo.config.googleMapsApiKey,
            url = 'https://maps.googleapis.com/maps/api/js';

        if (!key) {
            console.warn(
                'Neo.main.addon.GoogleMaps: Neo.config.googleMapsApiKey is not set. Google will reject the ' +
                'request and render its own error surface. See ' +
                'https://developers.google.com/maps/documentation/javascript/get-api-key'
            )
        }

        await new Promise((resolve, reject) => {
            const cleanup = () => {delete globalThis[readyCallbackName]};

            globalThis[readyCallbackName] = () => {
                cleanup();
                resolve()
            };

            DomAccess.loadScript(`${url}?key=${key}&loading=async&v=weekly&callback=${readyCallbackName}`)
                .catch(error => {
                    cleanup();
                    reject(error)
                })
        })
    }

    /**
     * @param {google.maps.Map} map
     * @param {String} mapId
     */
    onMapZoomChange(map, mapId) {
        DomEvents.sendMessageToApp({
            id   : mapId,
            path : [{cls: [], id: mapId}],
            type : 'googleMapZoomChange',
            value: map.zoom
        })
    }

    /**
     * @param {google.maps.Marker} marker
     * @param {Object} event
     * @param {Object} event.domEvent
     */
    onMarkerClick(marker, event) {
        let transformedEvent = DomEvents.getMouseEventData(event.domEvent);

        DomEvents.sendMessageToApp({
            id      : marker.neoId,
            path    : [{cls: [], id: marker.neoMapId}],
            type    : 'googleMarkerClick',
            domEvent: transformedEvent
        })
    }

    /**
     * @param data
     * @param {String} data.mapId
     * @param {Object} data.position
     */
    panTo(data) {
        this.maps[data.mapId].panTo(data.position)
    }

    /**
     * @param {Object} data
     * @param {String} data.mapId
     */
    removeMap(data) {
        delete this.maps[data.mapId];
        delete this.markers[data.mapId]
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    removeMarker(data) {
        let markers = this.markers[data.mapId];

        markers[data.id].setMap(null);
        delete markers[data.id]
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Object} data.value
     */
    setCenter(data) {
        this.maps[data.id].setCenter(data.value)
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Number} data.value
     */
    setZoom(data) {
        this.maps[data.id].setZoom(data.value)
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    showMarker(data) {
        this.markers[data.mapId][data.id].setMap(this.maps[data.mapId])
    }
}

export default Neo.setupClass(GoogleMaps);
