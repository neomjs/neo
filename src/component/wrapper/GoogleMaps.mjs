import Base            from '../../component/Base.mjs';
import ClassSystemUtil from '../../util/ClassSystem.mjs';
import Store           from '../../data/Store.mjs';

/**
 * @class Neo.component.wrapper.GoogleMaps
 * @extends Neo.component.Base
 */
class GoogleMaps extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.wrapper.GoogleMaps'
         * @protected
         */
        className: 'Neo.component.wrapper.GoogleMaps',
        /**
         * Prefer to use markerStoreConfig instead.
         * @member {Neo.data.Store|Object} markerStore_
         * @protected
         */
        markerStore_: {
            model: {
                fields: [{
                    name: 'id',
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
         * @member {Object} markerStoreConfig: null
         */
        markerStoreConfig: null,
        /**
         * @member {Number} zoom_=8
         */
        zoom_: 8
    }}

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.mapId
     * @param {Object} data.position
     * @param {String} [data.title]
     */
    addMarker(data) {
        Neo.main.addon.GoogleMaps.addMarker(data);
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
            me.onMarkerStoreLoad();
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
            Neo.main.addon.GoogleMaps.destroy({
                appName: me.appName,
                id     : me.id
            });
        }

        super.afterSetMounted(value, oldValue);

        if (value) {
            let opts = {
                appName: me.appName,
                id     : me.id,
                zoom   : me.zoom
            };

            setTimeout(() => {
                Neo.main.addon.GoogleMaps.create(opts).then(() => {
                    me.onComponentMounted();
                });
            }, 50);
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

        return ClassSystemUtil.beforeSetInstance(value, Store, this.markerStoreConfig);
    }

    /**
     * @param {Boolean} updateParentVdom=false
     * @param {Boolean} silent=false
     */
    destroy(updateParentVdom=false, silent=false) {
        Neo.main.addon.GoogleMaps.removeMap({
            mapId: this.id
        });

        super.destroy(updateParentVdom, silent);
    }

    /**
     *
     */
    onComponentMounted() {
        console.log('onComponentMounted', this.id);
    }

    /**
     *
     */
    onMarkerStoreLoad() {
        let me = this;

        me.markerStore.items.forEach(item => {
            Neo.main.addon.GoogleMaps.addMarker({
                mapId: me.id,
                ...item
            })
        })
    }
}

Neo.applyClassConfig(GoogleMaps);

export default GoogleMaps;
