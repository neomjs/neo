import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * @summary Main Thread Addon for High-Performance Grid Row Scroll Pinning (Hybrid Engine).
 *
 * This addon uses a Hybrid rAF + Scroll Listener architecture to prevent visual
 * row tearing during rapid scrolling (e.g., dragging the scrollbar thumb).
 *
 * **The Hybrid Architecture:**
 * 1.  **Stateful Updates:** VDOM updates from the App Worker do NOT trigger DOM mutations.
 *     They merely update an internal `workerScrollTop` state variable.
 * 2.  **Scroll Driven:** A native `scroll` listener on the Grid Wrapper triggers the logic.
 * 3.  **rAF Debouncing:** The scroll event schedules a single `requestAnimationFrame` callback.
 * 4.  **Optical Pinning:** Inside the rAF loop, if the `deltaY` (Actual Scroll - Worker Scroll)
 *     exceeds a large threshold (e.g. 30 rows), a CSS `translateY` is applied to the
 *     *entire Grid Body Content Node*. This instantly slides the perfectly-laid-out pool
 *     of rows to stay on screen, bypassing the 50ms+ VDOM worker latency.
 *
 * @class Neo.main.addon.GridRowScrollPinning
 * @extends Neo.main.addon.Base
 */
class GridRowScrollPinning extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.GridRowScrollPinning'
         * @protected
         */
        className: 'Neo.main.addon.GridRowScrollPinning',
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
     * Stores state per registered Grid Body.
     * Shape: { id, bodyId, wrapperNode, contentNode, workerScrollTop, rowHeight, ticking }
     * @member {Map<String, Object>} registrations=new Map()
     * @protected
     */
    registrations = new Map()

    /**
     * We bind the scroll handler once to avoid creating new functions per registration.
     * @member {Function} boundOnScroll
     * @protected
     */
    boundOnScroll = this.onScroll.bind(this)

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        Neo.main.DeltaUpdates.on('update', this.onDeltaUpdate, this)
    }

    /**
     * Executes inside the rAF loop. Reads DOM, does math, mutates DOM.
     * @param {String} id
     * @protected
     */
    applyPinning(id) {
        let me    = this,
            state = me.registrations.get(id);

        if (!state || !state.wrapperNode || !state.contentNode) {
            if (state) state.ticking = false;
            return
        }

        let actualScrollTop = state.wrapperNode.scrollTop || 0,
            deltaY          = actualScrollTop - state.workerScrollTop,
            absDelta        = Math.abs(deltaY);

        // Hysteresis: If we are already pinned, stay pinned until the worker is within 2px.
        // If we are NOT pinned, engage pinning if the worker lags by more than 1 row.
        let shouldPin = state.isPinned ? (absDelta > 2) : (absDelta > state.rowHeight);

        if (shouldPin) {
            state.contentNode.style.transform = `translate3d(0px, ${deltaY}px, 0px)`;
            state.isPinned = true;
        } else if (state.contentNode.style.transform) {
            // Worker has caught up to the scroll position. Clear the optical shift.
            state.contentNode.style.transform = null;
            state.isPinned = false;
        }

        state.ticking = false
    }

    /**
     * Updates internal baseline state. Does NOT mutate the DOM.
     * @param {Object} data The event payload from Neo.main.DeltaUpdates
     * @protected
     */
    onDeltaUpdate(data) {
        let me             = this,
            {deltas, meta} = data;

        if (!meta || !deltas) {
            return
        }

        me.registrations.forEach(state => {
            let bodyMeta = meta[state.bodyId];

            if (bodyMeta) {
                // Silently update the baseline state. The rAF loop will consume this on the next scroll tick.
                state.workerScrollTop = bodyMeta.scrollTop;
                state.rowHeight       = bodyMeta.rowHeight;

                // CRITICAL: If the worker sends an update after the user stops scrolling,
                // we must re-evaluate to clear the stale transform!
                if (!state.ticking) {
                    state.ticking = true;
                    requestAnimationFrame(() => me.applyPinning(state.id))
                }
            }
        })
    }

    /**
     * Triggered by native browser scroll. Debounces via rAF.
     * @param {Event} event
     * @protected
     */
    onScroll(event) {
        let me      = this,
            wrapper = event.target,
            state;

        // Find which registration this scroll event belongs to based on the wrapper node
        for (const reg of me.registrations.values()) {
            if (reg.wrapperNode === wrapper) {
                state = reg;
                break
            }
        }

        if (state && !state.ticking) {
            state.ticking = true;
            requestAnimationFrame(() => me.applyPinning(state.id))
        }
    }

    /**
     * Registers a grid for row scroll pinning and attaches native scroll listener.
     * @param {Object} data
     * @param {String} data.bodyId The ID of the grid body
     * @param {String} data.id     Unique identifier for the registration (e.g. ScrollManager id)
     */
    register({bodyId, id}) {
        let me          = this,
            wrapperNode = DomAccess.getElement(bodyId + '__wrapper'),
            contentNode = DomAccess.getElement(bodyId);

        if (wrapperNode && contentNode) {
            me.registrations.set(id, {
                id,
                bodyId,
                wrapperNode,
                contentNode,
                rowHeight      : 0,
                ticking        : false,
                workerScrollTop: 0
            });

            wrapperNode.addEventListener('scroll', me.boundOnScroll, {passive: true})
        }
    }

    /**
     * Unregisters a grid and cleans up listeners.
     * @param {Object} data
     * @param {String} data.id
     */
    unregister({id}) {
        let me    = this,
            state = me.registrations.get(id);

        if (state && state.wrapperNode) {
            state.wrapperNode.removeEventListener('scroll', me.boundOnScroll);
            me.registrations.delete(id)
        }
    }
}

export default Neo.setupClass(GridRowScrollPinning);