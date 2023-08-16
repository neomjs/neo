import Base      from '../../core/Base.mjs';
import DomAccess from '../DomAccess.mjs'

/**
 * @class Neo.main.addon.ResizeObserver
 * @extends Neo.core.Base
 * @singleton
 */
class NeoResizeObserver extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.ResizeObserver'
         * @protected
         */
        className: 'Neo.main.addon.ResizeObserver',
        /**
         * @member {ResizeObserver|null} instance=null
         * @protected
         */
        instance: null,
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'register',
                'unregister'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.instance = new ResizeObserver(me.onResize.bind(me))
    }

    /**
     * Internal callback for the ResizeObserver instance
     * @param {HTMLElement[]} entries
     * @param {ResizeObserver} observer
     * @protected
     */
    onResize(entries, observer) {
        console.log('onResize', entries)
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    register(data) {
        this.instance.observe(DomAccess.getElement(data.id))
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    unregister(data) {
        this.instance.unobserve(DomAccess.getElement(data.id))
    }
}

let instance = Neo.applyClassConfig(NeoResizeObserver);

export default instance;
