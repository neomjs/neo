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
 * **Rendering-Starvation Contract:**
 * Both the native `ResizeObserver` (spec: deliveries ride rendering opportunities) and a pure
 * rAF-locked dispatch starve in documents that never paint — hidden browser panes, occluded or
 * backgrounded windows. Worker timers and postMessage keep flowing there, so a grid keeps
 * receiving data while its geometry silently fossilizes at the last delivered box. Two additive
 * guards keep this carrier truthful without touching the visible-path behavior:
 * 1. The dispatch dam races `requestAnimationFrame` against a timer fallback. On a rendering
 *    document rAF always wins (vsync coalescing preserved byte-for-byte); on a starved document
 *    the timer opens the dam.
 * 2. While `document.hidden` with registered targets, a slow poll compares each target's
 *    border-box against the last dispatched size (layout computes without paint) and feeds
 *    synthetic entries through the exact same dispatch pipeline — covering boxes that change
 *    while the native observer cannot fire at all.
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
         * Poll cadence in ms for hidden documents, where the native observer cannot deliver
         * at all. Browsers throttle hidden-page timers (typically to 1Hz, intensively to
         * 1/min), so the effective cadence is a floor, not a promise — convergence degrades
         * gracefully, it never dies.
         * @member {Number} hiddenPollInterval=1000
         */
        hiddenPollInterval: 1000,
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
        },
        /**
         * Delay in ms for the timer arm of the dispatch race. Any value above one frame
         * period keeps rAF winning on every rendering document; the timer only ever fires
         * where no frame will come.
         * @member {Number} starvedFlushDelay=100
         */
        starvedFlushDelay: 100
    }

    /**
     * Bound visibilitychange listener, kept for removal on destroy.
     * @member {Function|null} #boundVisibilityChange=null
     * @private
     */
    #boundVisibilityChange = null
    /**
     * Last dispatched border-box size per target id. The hidden poll compares against the
     * size the worker actually knows about, not against the previous poll tick.
     * @member {Map} #lastDispatchedSize=new Map()
     * @private
     */
    #lastDispatchedSize = new Map()
    /**
     * @member {Map} #pendingEntries=new Map()
     * @private
     */
    #pendingEntries = new Map()
    /**
     * @member {Number|null} #pollIntervalId=null
     * @private
     */
    #pollIntervalId = null
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
     * Timer arm of the dispatch race.
     * @member {Number|null} #timerId=null
     * @private
     */
    #timerId = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.instance = new ResizeObserver(me.onResize.bind(me));

        me.#boundVisibilityChange = me.onVisibilityChange.bind(me);
        document.addEventListener('visibilitychange', me.#boundVisibilityChange);

        // A document can already be hidden at addon construction time (e.g. an embedded
        // pane booting in the background) — sync once instead of waiting for a flip.
        me.syncPollState()
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

        me.armDispatch()
    }

    /**
     * Arms the dispatch race for the pending queue: rAF for vsync coalescing on rendering
     * documents, a timer fallback for documents that will never service a frame. Whichever
     * fires first dispatches and disarms the other.
     * @protected
     */
    armDispatch() {
        let me = this;

        if (!me.#rAFId) {
            me.#rAFId = requestAnimationFrame(() => {
                me.dispatchResizeEvents()
            })
        }

        if (!me.#timerId) {
            me.#timerId = setTimeout(() => {
                me.dispatchResizeEvents()
            }, me.starvedFlushDelay)
        }
    }

    /**
     * Dispatches the accumulated events and resets the queue.
     * Disarms both race arms first: called from either one, cancelling the already-fired
     * arm is a harmless no-op, cancelling the pending one prevents a duplicate dispatch.
     * @protected
     */
    dispatchResizeEvents() {
        let me      = this,
            entries = Array.from(me.#pendingEntries.values());

        me.#rAFId  !== null && cancelAnimationFrame(me.#rAFId);
        me.#timerId !== null && clearTimeout(me.#timerId);

        me.#rAFId   = null;
        me.#timerId = null;
        me.#pendingEntries.clear();

        entries.forEach(entry => {
            // the content of entry is not spreadable, so we need to manually convert it
            // structuredClone(entry) throws a JS error => ResizeObserverEntry object could not be cloned.

            let borderBoxSize             = entry.borderBoxSize[0],
                contentBoxSize            = entry.contentBoxSize[0],
                devicePixelContentBoxSize = entry.devicePixelContentBoxSize?.[0] || {}, // Not supported in Safari yet
                path                      = DomEvents.getPathFromElement(entry.target).map(e => DomEvents.getTargetData(e));

            me.#lastDispatchedSize.set(entry.target.id, {
                blockSize : borderBoxSize.blockSize,
                inlineSize: borderBoxSize.inlineSize
            });

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
     * Builds an entry-shaped object for a box the native observer could not report.
     * Reading offset metrics and computed style forces layout, which hidden documents
     * compute fine — only paint is unavailable — so every field carries layout truth.
     * @param {HTMLElement} node
     * @returns {Object} Consumable by dispatchResizeEvents() like a native entry
     * @protected
     */
    createSyntheticEntry(node) {
        let style         = getComputedStyle(node),
            pf            = prop => parseFloat(style.getPropertyValue(prop)) || 0,
            blockSize     = node.offsetHeight,
            inlineSize    = node.offsetWidth,
            paddingLeft   = pf('padding-left'),
            paddingTop    = pf('padding-top'),
            contentWidth  = inlineSize - paddingLeft - pf('padding-right') - pf('border-left-width') - pf('border-right-width'),
            contentHeight = blockSize - paddingTop - pf('padding-bottom') - pf('border-top-width') - pf('border-bottom-width');

        return {
            target        : node,
            borderBoxSize : [{blockSize, inlineSize}],
            contentBoxSize: [{blockSize: contentHeight, inlineSize: contentWidth}],

            // Per spec, contentRect is the content box positioned relative to the padding origin
            contentRect: {
                bottom: paddingTop + contentHeight,
                height: contentHeight,
                left  : paddingLeft,
                right : paddingLeft + contentWidth,
                top   : paddingTop,
                width : contentWidth,
                x     : paddingLeft,
                y     : paddingTop
            }
        }
    }

    /**
     *
     */
    destroy() {
        let me = this;

        me.#rAFId        !== null && cancelAnimationFrame(me.#rAFId);
        me.#timerId      !== null && clearTimeout(me.#timerId);
        me.#pollIntervalId !== null && clearInterval(me.#pollIntervalId);

        me.#boundVisibilityChange && document.removeEventListener('visibilitychange', me.#boundVisibilityChange);

        super.destroy()
    }

    /**
     * @protected
     */
    onVisibilityChange() {
        this.syncPollState()
    }

    /**
     * Walks every registered target and queues a synthetic entry for each border-box that
     * moved away from the last size the worker was told about. Feeding the shared queue
     * keeps ordering, coalescing and payload shape identical to the native path.
     * @protected
     */
    pollHiddenTargets() {
        let me = this;

        Object.keys(me.#targetToComponents).forEach(id => {
            let node = DomAccess.getElement(id);

            if (!node) {
                return
            }

            let last = me.#lastDispatchedSize.get(id);

            if (!last || last.blockSize !== node.offsetHeight || last.inlineSize !== node.offsetWidth) {
                me.#pendingEntries.set(node, me.createSyntheticEntry(node))
            }
        });

        me.#pendingEntries.size > 0 && me.armDispatch()
    }

    /**
     * Starts or stops the hidden poll so it runs exactly while both conditions hold:
     * the document is hidden AND at least one target is registered.
     * @protected
     */
    syncPollState() {
        let me        = this,
            needsPoll = document.hidden && Object.keys(me.#targetToComponents).length > 0;

        if (needsPoll && me.#pollIntervalId === null) {
            me.#pollIntervalId = setInterval(() => {
                me.pollHiddenTargets()
            }, me.hiddenPollInterval)
        } else if (!needsPoll && me.#pollIntervalId !== null) {
            clearInterval(me.#pollIntervalId);
            me.#pollIntervalId = null
        }
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

            me.instance.observe(node);

            // A target registered inside a hidden document gets NO initial native delivery
            // (observe() schedules it for a rendering step that will not come) — the poll
            // is what carries its first real box to the worker.
            me.syncPollState()
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
                me.#lastDispatchedSize.delete(id);
                node && me.instance.unobserve(node);
                me.syncPollState()
            }
        }
    }
}

export default Neo.setupClass(NeoResizeObserver);
