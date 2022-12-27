import Base      from '../../core/Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * @class Neo.main.addon.GoogleMaps
 * @extends Neo.core.Base
 * @singleton
 */
class GoogleMaps extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.main.addon.GoogleMaps'
         * @protected
         */
        className: 'Neo.main.addon.GoogleMaps',
        /**
         * @member {Object} maps={}
         */
        maps: {},
        /**
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'create'
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
     */
    create(data) {
        this.maps[data.id] = new google.maps.Map(DomAccess.getElement(data.id), {
            center: { lat: -34.397, lng: 150.644 },
            zoom: 8,
        });
    }

    /**
     * @protected
     */
    loadApi() {
        DomAccess.loadScript('https://maps.googleapis.com/maps/api/js?key=AIzaSyCRj-EPE3H7PCzZtYCmDzln6sj7uPCGohA&v=weekly').then(() => {
            console.log('GoogleMaps API loaded');
        });
    }
}

Neo.applyClassConfig(GoogleMaps);

let instance = Neo.create(GoogleMaps);

Neo.applyToGlobalNs(instance);

export default instance;
