import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';
import DomEvents from '../DomEvents.mjs';

/**
 * @class Neo.main.addon.ResizeObserver
 * @extends Neo.main.addon.Base
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
        }
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
     * Internal callback for the ResizeObserver instance.
     * See: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserverEntry
     * @param {HTMLElement[]} entries
     * @param {ResizeObserver} observer
     * @protected
     */
    onResize(entries, observer) {
        entries.forEach(entry => {
            // the content of entry is not spreadable, so we need to manually convert it
            // structuredClone(entry) throws a JS error => ResizeObserverEntry object could not be cloned.

            let borderBoxSize             = entry.borderBoxSize[0],
                contentBoxSize            = entry.contentBoxSize[0],
                devicePixelContentBoxSize = entry.devicePixelContentBoxSize?.[0] || {}, // Not supported in Safari yet
                path                      = DomEvents.getPathFromElement(entry.target).map(e => DomEvents.getTargetData(e));

            Neo.worker.Manager.sendMessage('app', {
                action   : 'domEvent',
                eventName: 'resize',

                data: {
                    contentRect: DomEvents.parseDomRect(entry.contentRect),
                    id         : entry.target.id,
                    path,
                    rect       : path[0].rect,

                    borderBoxSize: {
                        blockSize : borderBoxSize.blockSize,
                        inlineSize: borderBoxSize.inlineSize
                    },

                    contentBoxSize: {
                        blockSize : contentBoxSize.blockSize,
                        inlineSize: contentBoxSize.inlineSize
                    },

                    devicePixelContentBoxSize: {
                        blockSize : devicePixelContentBoxSize.blockSize,
                        inlineSize: devicePixelContentBoxSize.inlineSize
                    }
                }
            })
        })
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

Neo.applyClassConfig(NeoResizeObserver);

export default NeoResizeObserver;
