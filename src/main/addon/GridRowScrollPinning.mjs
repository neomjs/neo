import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * @summary Main Thread Addon for High-Performance Grid Row Scroll Pinning (Synchronous Engine).
 *
 * This addon uses a Synchronous Scroll Listener architecture to prevent visual
 * row tearing during rapid scrolling (e.g., dragging the scrollbar thumb).
 *
 * **The Synchronous Architecture:**
 * 1.  **Stateful Updates:** VDOM updates from the App Worker do NOT trigger DOM mutations.
 *     They merely update an internal `workerScrollTop` state variable.
 * 2.  **Scroll Driven:** A native `scroll` listener on the Grid Wrapper triggers the logic.
 * 3.  **Synchronous Injection:** The scroll event synchronously calculates `deltaY` and
 *     immediately applies a CSS `translateY` to the *entire Grid Body Content Node*. 
 *     This ensures the optical pinning is injected perfectly in phase with the native
 *     scroll event, before the browser paints the next frame.
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
     * Shape: { id, bodyId, wrapperNode, contentNode, workerScrollTop, rowHeight, isPinned }
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
     * Executes synchronously. Reads DOM, does math, mutates DOM.
     * @param {String} id
     * @protected
     */
    applyPinning(id) {
        let me    = this,
            state = me.registrations.get(id);

        if (!state || !state.wrapperNode || !state.contentNode) {
            return
        }

        let actualScrollTop = state.wrapperNode.scrollTop || 0,
            deltaY          = actualScrollTop - state.workerScrollTop,
            absDelta        = Math.abs(deltaY);

        // 500px is a safe threshold to ignore standard mouse wheel ticks entirely,
        // allowing native smooth scroll to operate freely without jitter.
        // It only engages when dragging the thumb massively outpaces the worker.
        let threshold = 500,
            shouldPin = state.isPinned ? (absDelta > 2) : (absDelta > threshold);

        if (shouldPin) {
            // Apply the full deltaY to perfectly freeze the stale rows on screen
            state.contentNode.style.setProperty('--grid-row-pin-offset', `${deltaY}px`);
            state.isPinned = true;
        } else if (state.isPinned) {
            // Worker has caught up to the scroll position. Clear the optical shift.
            state.contentNode.style.setProperty('--grid-row-pin-offset', '0px');
            state.isPinned = false;
        }
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
                // Silently update the baseline state.
                state.workerScrollTop = bodyMeta.scrollTop;
                state.rowHeight       = bodyMeta.rowHeight;
                state.bufferRowRange  = bodyMeta.bufferRowRange;

                // CRITICAL: Synchronously re-evaluate pinning to clear stale transforms
                // if the worker catches up after the user stops scrolling.
                me.applyPinning(state.id)
            }
        })
    }

    /**
     * Triggered by native browser scroll. Synchronous execution.
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

        if (state) {
            me.applyPinning(state.id)
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
                bufferRowRange : 0,
                isPinned       : false,
                rowHeight      : 0,
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