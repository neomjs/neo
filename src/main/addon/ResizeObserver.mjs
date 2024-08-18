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
         * If a target node is not found when calling register(),
         * we can specify the amount of retries with a 100ms delay.
         * @member {Number} registerAttempts=3
         */
        registerAttempts: 3,
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
     * @param {Number} count=0
     */
    async register(data, count=0) {
        let me   = this,
            node = DomAccess.getElement(data.id);

        if (node) {
            me.instance.observe(node)
        } else if (count < me.registerAttempts) {
            await me.timeout(100);
            count++;
            me.register(data, count)
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    unregister(data) {
        this.instance.unobserve(DomAccess.getElement(data.id))
    }
}

export default Neo.setupClass(NeoResizeObserver);
