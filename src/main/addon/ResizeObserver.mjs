import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';
import DomEvents from '../DomEvents.mjs';

/**
 * @summary Main thread bridge for the native DOM ResizeObserver API.
 *
 * This addon provides a centralized, highly optimized way for App Worker components to
 * react to DOM node size changes. Instead of components polling or setting up their own
 * individual observers, they register their target IDs with this singleton.
 *
 * **Performance & Throttling Architecture:**
 * The native `ResizeObserver` can fire multiple times per frame during continuous layout
 * thrashing (e.g., resizing the browser window). Sending a `postMessage` to the App Worker
 * for every single micro-shift would flood the worker bridge and cause severe jank.
 *
 * To prevent this, this addon acts as a hardware-synced dam:
 * 1. It catches all rapid-fire resize events and accumulates them in a private Map.
 *    This ensures that if a node resizes multiple times before a paint, only the final state is kept.
 * 2. It uses `requestAnimationFrame` to lock the dispatch. It only flushes the Map
 *    and sends the `postMessage` payload exactly once per physical display frame (vsync).
 *
 * This guarantees the App Worker always receives the freshest possible layout data without
 * ever being overwhelmed, regardless of how aggressively the DOM is mutating.
 *
 * @class Neo.main.addon.ResizeObserver
 * @extends Neo.main.addon.Base
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
     * @member {Map} #pendingEntries=new Map()
     * @private
     */
    #pendingEntries = new Map()
    /**
     * @member {Number|null} #rAFId=null
     * @private
     */
    #rAFId = null
    /**
     * @member {Object} #targetToComponents={}
     * @private
     */
    #targetToComponents = {}

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
        let me = this;

        entries.forEach(entry => {
            me.#pendingEntries.set(entry.target, entry)
        });

        if (!me.#rAFId) {
            me.#rAFId = requestAnimationFrame(() => {
                me.dispatchResizeEvents()
            })
        }
    }

    /**
     * Dispatches the accumulated events and resets the queue.
     * @protected
     */
    dispatchResizeEvents() {
        let me      = this,
            entries = Array.from(me.#pendingEntries.values());

        me.#rAFId = null;
        me.#pendingEntries.clear();

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
                    componentIds: me.#targetToComponents[entry.target.id] || [],
                    contentRect : DomEvents.parseDomRect(entry.contentRect),
                    id          : entry.target.id,
                    path,
                    rect        : path[0].rect,

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
     * @param {String} data.componentId
     * @param {String} data.id
     * @param {Number} count=0
     */
    async register(data, count=0) {
        let me   = this,
            node = DomAccess.getElement(data.id);

        if (node) {
            me.#targetToComponents[data.id] ??= [];

            if (!me.#targetToComponents[data.id].includes(data.componentId)) {
                me.#targetToComponents[data.id].push(data.componentId)
            }

            me.instance.observe(node)
        } else if (count < me.registerAttempts) {
            await me.timeout(100);
            count++;
            me.register(data, count)
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.componentId
     * @param {String} data.id
     */
    unregister(data) {
        let me           = this,
            {id}         = data,
            node         = DomAccess.getElement(id),
            componentIds = me.#targetToComponents[id];

        if (componentIds) {
            me.#targetToComponents[id] = componentIds.filter(cid => cid !== data.componentId);

            if (me.#targetToComponents[id].length === 0) {
                delete me.#targetToComponents[id];
                node && me.instance.unobserve(node)
            }
        }
    }
}

export default Neo.setupClass(NeoResizeObserver);
