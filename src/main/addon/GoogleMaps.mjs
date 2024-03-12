import Base       from './Base.mjs';
import DomAccess  from '../DomAccess.mjs';
import DomEvents  from '../DomEvents.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * @class Neo.main.addon.GoogleMaps
 * @extends Neo.main.addon.Base
 */
class GoogleMaps extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.GoogleMaps'
         * @protected
         */
        className: 'Neo.main.addon.GoogleMaps',
        /**
         * @member {Neo.core.Base[]} mixins=[Observable]
         */
        mixins: [Observable],
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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.loadApi();
    }

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
        let me    = this,
            mapId = data.mapId,
            listenerId, marker;

        if (!me.maps[mapId]) {
            listenerId = me.on('mapCreated', id => {
                if (mapId === id) {
                    me.un(listenerId);
                    me.addMarker(data);
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

            marker.addListener('click', me.onMarkerClick.bind(me, marker));
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
        let me = this,
            id = data.id,
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

        me.fire('mapCreated', id);
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
        delete me.markers[data.mapId];
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
            me.geoCoder = new google.maps.Geocoder();
        }

        response = await me.geoCoder.geocode(data);

        return JSON.parse(JSON.stringify(response));
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    hideMarker(data) {
        this.markers[data.mapId][data.id].setMap(null);
    }

    /**
     * @protected
     */
    loadApi() {
        let key = Neo.config.googleMapsApiKey,
            url = ' https://maps.googleapis.com/maps/api/js';

        DomAccess.loadScript(`${url}?key=${key}&v=weekly&callback=Neo.emptyFn`).then(() => {
            console.log('GoogleMaps API loaded');
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
        this.maps[data.mapId].panTo(data.position);
    }

    /**
     * @param {Object} data
     * @param {String} data.mapId
     */
    removeMap(data) {
        delete this.maps[data.mapId];
        delete this.markers[data.mapId];
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    removeMarker(data) {
        let markers = this.markers[data.mapId];

        markers[data.id].setMap(null);
        delete markers[data.id];
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Object} data.value
     */
    setCenter(data) {
        this.maps[data.id].setCenter(data.value);
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Number} data.value
     */
    setZoom(data) {
        this.maps[data.id].setZoom(data.value);
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     */
    showMarker(data) {
        this.markers[data.mapId][data.id].setMap(this.maps[data.mapId]);
    }
}

Neo.setupClass(GoogleMaps);

export default GoogleMaps;
