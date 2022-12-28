import Base       from '../../core/Base.mjs';
import DomAccess  from '../DomAccess.mjs';
import DomEvents  from '../DomEvents.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * @class Neo.main.addon.GoogleMaps
 * @extends Neo.core.Base
 * @singleton
 */
class GoogleMaps extends Base {
    /**
     * @member {Object} maps={}
     */
    maps = {}
    /**
     * @member {Object} markers={}
     */
    markers = {}

    static getConfig() {return {
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
                'hideMarker',
                'panTo',
                'removeMap',
                'removeMarker',
                'setCenter',
                'setZoom',
                'showMarker'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.loadApi();
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     * @param {Object} data.position
     * @param {String} [data.title]
     */
    addMarker(data) {
        let me = this,
            listenerId, marker;

        if (!me.maps[data.mapId]) {
            listenerId = me.on('mapCreated', mapId => {
                if (data.mapId === mapId) {
                    me.un(listenerId);
                    me.addMarker(data);
                }
            })
        } else {
            Neo.ns(`${data.mapId}`, true, me.markers);

            me.markers[data.mapId][data.id] = marker = new google.maps.Marker({
                map     : me.maps[data.mapId],
                neoId   : data.id,    // custom property
                neoMapId: data.mapId, // custom property
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
        let me = this;

        me.maps[data.id] = new google.maps.Map(DomAccess.getElement(data.id), {
            center           : data.center,
            fullscreenControl: data.fullscreenControl,
            maxZoom          : data.maxZoom,
            minZoom          : data.minZoom,
            zoom             : data.zoom,
            zoomControl      : data.zoomControl,
            ...data.mapOptions
        });

        me.fire('mapCreated', data.id);
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
        let key = Neo.config.googleMapsApiKey;

        DomAccess.loadScript(`https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly`).then(() => {
            console.log('GoogleMaps API loaded');
        })
    }

    /**
     * @param {google.maps.Marker} marker
     * @param {Object} event
     * @param {Object} event.domEvent
     */
    onMarkerClick(marker, event) {
        // in theory, we could parse and pass the entire DOM event.
        // feel free to open a feature request ticket, in case you need more data into the app worker.

        DomEvents.sendMessageToApp({
            id  : marker.neoId,
            path: [{cls: [], id: marker.neoMapId}],
            type: 'googleMarkerClick'
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

Neo.applyClassConfig(GoogleMaps);

let instance = Neo.create(GoogleMaps);

Neo.applyToGlobalNs(instance);

export default instance;
