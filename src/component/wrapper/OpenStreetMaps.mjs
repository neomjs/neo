import Component       from '../Base.mjs';
import ClassSystemUtil from '../../util/ClassSystem.mjs';
import Store           from '../../data/Store.mjs';

/**
 * In development: Do not use inside your apps until the implementation is finished.
 * @class Neo.component.wrapper.OpenStreetMaps
 * @extends Neo.component.Base
 * @experimental
 */
class OpenStreetMaps extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.wrapper.OpenStreetMaps'
         * @protected
         */
        className: 'Neo.component.wrapper.OpenStreetMaps',
        /**
         * @member {String} ntype='openstreetmaps'
         * @protected
         */
        ntype: 'openstreetmaps',
        /**
         * Specify lat & lng for the current focus position
         * @member {Object} center_={lat: -34.397, lng: 150.644}
         * @reactive
         */
        center_: {lat: -34.397, lng: 150.644},
        /**
         * Prefer to use markerStoreConfig instead.
         * @member {Neo.data.Store|Object} markerStore_
         * @protected
         * @reactive
         */
        markerStore_: {
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
                    name: 'title',
                    type: 'String'
                }]
            }
        },
        /**
         * @member {Number} zoom_=8
         * @reactive
         */
        zoom_: 8
    }

    /**
     * false hides the default fullscreen control
     * @member {Boolean} fullscreenControl=true
     */
    fullscreenControl = true
    /**
     * Internal flag. Gets set to true once Neo.main.addon.OpenStreetMaps.create() is finished.
     * @member {Boolean} mapCreated=false
     */
    mapCreated = false
    /**
     * Pass any options to the map instance which are not explicitly defined here
     * @member {Object} mapOptions={}
     */
    mapOptions = {}
    /**
     * @member {Object} markerStoreConfig=null
     */
    markerStoreConfig = null
    /**
     * null => the maximum zoom from the current map type is used instead
     * @member {Number|null} maxZoom=null
     */
    maxZoom = null
    /**
     null => the minimum zoom from the current map type is used instead
     * @member {Number|null} minZoom=null
     */
    minZoom = null
    /**
     * false hides the default zoom control
     * @member {Boolean} zoomControl=true
     */
    zoomControl = true

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            openStreetMapZoomChange: me.onMapZoomChange,
            openStreetMapMarkerClick  : me.parseMarkerClick,
            local              : false,
            scope              : me
        })
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
        let {appName, windowId} = this;

        Neo.main.addon.OpenStreetMaps.addMarker({
            appName,
            windowId,
            ...data
        })
    }

    /**
     * Triggered after the center config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetCenter(value, oldValue) {
        let {appName, id, windowId} = this;

        if (this.mapCreated) {
            Neo.main.addon.OpenStreetMaps.setCenter({
                appName,
                id,
                value,
                windowId
            })
        }
    }

    /**
     * Triggered after the markerStore config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetMarkerStore(value, oldValue) {
        let me = this;

        value.on({
            load : me.onMarkerStoreLoad,
            scope: me
        });

        if (value.items.length > 0) {
            me.onMarkerStoreLoad()
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        let me = this;

        if (value === false && oldValue !== undefined) {
            me.removeMap()
        }

        super.afterSetMounted(value, oldValue);

        if (value) {
            let opts = {
                appName          : me.appName,
                center           : me.center,
                fullscreenControl: me.fullscreenControl,
                id               : me.id,
                mapOptions       : me.mapOptions,
                maxZoom          : me.maxZoom,
                minZoom          : me.minZoom,
                zoom             : me.zoom,
                zoomControl      : me.zoomControl
            };

            me.timeout(50).then(() => {
                Neo.main.addon.OpenStreetMaps.create(opts).then(() => {
                    me.mapCreated = true;
                    me.onComponentMounted()
                })
            })
        }
    }

    /**
     * Triggered after the zoom config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetZoom(value, oldValue) {
        let me                      = this,
            {appName, id, windowId} = me;

        if (me.mapCreated) {
            Neo.main.addon.OpenStreetMaps.setZoom({
                appName,
                id,
                value,
                windowId
            });

            me.fire('zoomChange', {id, value})
        }
    }

    /**
     * Triggered before the markerStore config gets changed.
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    beforeSetMarkerStore(value, oldValue) {
        oldValue?.destroy();

        return ClassSystemUtil.beforeSetInstance(value, Store, this.markerStoreConfig)
    }

    /**
     * @param {Boolean} updateParentVdom=false
     * @param {Boolean} silent=false
     */
    destroy(updateParentVdom=false, silent=false) {
        this.removeMap();
        super.destroy(updateParentVdom, silent)
    }

    /**
     * @param {String} id
     */
    hideMarker(id) {
        let {appName, windowId} = this;

        Neo.main.addon.OpenStreetMaps.hideMarker({
            appName,
            id,
            mapId: this.id,
            windowId
        })
    }

    /**
     * Hook to use once the map instance got rendered
     */
    onComponentMounted() {
    }

    /**
     * @param {Object} data
     */
    onMapZoomChange(data) {
        this.zoom = data.value
    }

    /**
     *
     */
    onMarkerStoreLoad() {
        let {appName, id, windowId} = this;

        Neo.main.addon.OpenStreetMaps.destroyMarkers({
            appName,
            id,
            windowId
        });

        this.markerStore.items.forEach(item => {
            Neo.main.addon.OpenStreetMaps.addMarker({
                appName,
                mapId: id,
                windowId,
                ...item
            })
        })
    }

    /**
     * @param {Object} position
     * @param {Number} position.lat
     * @param {Number} position.lng
     */
    panTo(position) {
        let {appName, id, windowId} = this;

        Neo.main.addon.OpenStreetMaps.panTo({
            appName,
            mapId: id,
            position,
            windowId
        })
    }

    /**
     * Internal function. Use onMarkerClick() or the markerClick event instead
     * @param {Object} data
     * @protected
     */
    parseMarkerClick(data) {
        let me = this;

        data.record = me.markerStore.get(data.id);

        me.onMarkerClick?.(data);

        me.fire('markerClick', {id: me.id, data})
    }

    /**
     *
     */
    removeMap() {
        let {appName, id, windowId} = this;

        Neo.main.addon.OpenStreetMaps.removeMap({
            appName,
            mapId: id,
            windowId
        })
    }

    /**
     * @param {String} id
     */
    removeMarker(id) {
        let {appName, windowId} = this;

        Neo.main.addon.OpenStreetMaps.removeMarker({
            appName,
            id,
            mapId: this.id,
            windowId
        })
    }

    /**
     * @param {String} id
     */
    showMarker(id) {
        let {appName, windowId} = this;

        Neo.main.addon.OpenStreetMaps.showMarker({
            appName,
            id,
            mapId: this.id,
            windowId
        })
    }
}

export default Neo.setupClass(OpenStreetMaps);
