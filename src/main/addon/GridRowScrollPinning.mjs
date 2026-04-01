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
     * Shape: { id, bodyId, wrapperNode, contentNode, workerScrollTop, isThumbDragging, scrollTimeoutId }
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
     * @member {Function} boundOnMouseDown
     * @protected
     */
    boundOnMouseDown = this.onMouseDown.bind(this)

    /**
     * @member {Function} boundOnMouseUp
     * @protected
     */
    boundOnMouseUp = this.onMouseUp.bind(this)

    /**
     * Tracks which registration is currently being thumb-dragged.
     * @member {String|null} activeDragId=null
     * @protected
     */
    activeDragId = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        Neo.main.DeltaUpdates.on('update', this.onDeltaUpdate, this)
    }

    /**
     * Re-calculates and applies pinning offsets based on the actual scroll position
     * minus the worker's last known scroll position.
     *
     * **Architectural Note (Chesterton's Fence):**
     * You might look at `wrapperNode.scrollTop` and think: "This forces a synchronous layout
     * during a hot update loop! We should cache it!" **DO NOT DO THIS.**
     *
     * The Grid has a fixed pool of DOM nodes. If a user drags the thumb in a 2.5 million pixel
     * high container, the native scroll position jumps massively in a single frame, pushing the
     * pooled DOM nodes entirely out of the viewport. This causes a "white flash" while the
     * App Worker asynchronously calculates the new VDOM deltas.
     *
     * This method applies a reverse CSS `transform` to artificially "pin" the stale rows
     * back into the viewport until the worker catches up. To make this optical illusion seamless,
     * `deltaY` must be calculated against the *exact, un-cached, physical* compositor state of the
     * scrollbar at the exact millisecond the worker's VDOM deltas are applied.
     * Caching `scrollTop` here would result in misaligned math and permanent optical jitter.
     * The forced layout is the required tax for 60fps visual stability.
     *
     * @param {String} id Registration ID
     * @protected
     */
    applyPinning(id) {
        let me    = this,
            state = me.registrations.get(id);

        if (!state || !state.wrapperNode) {
            return
        }

        let actualScrollTop = state.wrapperNode.scrollTop || 0,
            deltaY          = actualScrollTop - state.workerScrollTop,
            contentNodes    = state.bodyIds.map(bodyId => DomAccess.getElement(bodyId)).filter(Boolean);

        if (contentNodes.length < 1) {
            return
        }

        // ONLY engage pinning if the user is explicitly dragging the scrollbar thumb.
        // We explicitly ignore Wheel, Trackpad, Keyboard, and Body Drag scrolling,
        // allowing their native/custom physics to operate perfectly.
        if (state.isThumbDragging) {
            state.isPinningActive = true;
        }

        // Once pinning is engaged, we MUST KEEP pinning active until the worker physically catches up,
        // otherwise we will get a massive blank white screen if the user releases the mouse mid-lag.
        if (state.isPinningActive) {
            // Check if worker caught up. We use a 5px threshold for sub-pixel accuracy.
            if (!state.isThumbDragging && Math.abs(deltaY) < 5) {
                state.isPinningActive = false;
            }
        }

        if (state.isPinningActive) {
            contentNodes.forEach(node => {
                node.style.setProperty('--grid-row-pin-offset', `${deltaY}px`);
            });
        } else if (contentNodes[0].style.getPropertyValue('--grid-row-pin-offset') !== '0px') {
            contentNodes.forEach(node => {
                node.style.setProperty('--grid-row-pin-offset', '0px');
            });
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
            let bodyMeta;

            state.bodyIds.forEach(bodyId => {
                if (meta[bodyId]) {
                    bodyMeta = meta[bodyId];
                }
            });

            if (bodyMeta) {
                // Silently update the baseline state.
                state.workerScrollTop = bodyMeta.scrollTop;

                // CRITICAL: Synchronously re-evaluate pinning to clear stale transforms
                // if the worker catches up.
                me.applyPinning(state.id)
            }
        })
    }

    /**
     * @param {Event} event
     * @protected
     */
    onMouseDown(event) {
        let me        = this,
            scrollbar = event.currentTarget,
            state;

        for (const reg of me.registrations.values()) {
            if (reg.wrapperNode === scrollbar) {
                state = reg;
                break
            }
        }

        if (state) {
            // Strict boundary check: only engage if clicking the vertical scrollbar track.
            // Clicking the native scrollbar hit-tests to the container element itself.
            let rect                = scrollbar.getBoundingClientRect(),
                isVerticalScrollbar = false;

            if (event.clientX) {
                // 1. Standard scrollbars: If target is the wrapper, offsetX > clientWidth is 100% reliable.
                if (event.target === scrollbar && event.offsetX >= scrollbar.clientWidth) {
                    isVerticalScrollbar = true;
                }
                // 2. Mac OS Overlay Scrollbars: These often "fall through" and hit-test the child element.
                // We must use absolute clientX coordinates to detect clicks in the "phantom" scrollbar layer (last ~18px).
                else if (event.clientX >= (rect.right - 18) && event.clientX <= rect.right) {
                    isVerticalScrollbar = true;
                }
            }

            if (!isVerticalScrollbar) {
                return
            }

            me.activeDragId = state.id;
            state.isThumbDragging = true;
            
            // Add a global mouseup listener to catch the release even if the cursor
            // leaves the scrollbar area.
            window.addEventListener('mouseup', me.boundOnMouseUp);
            window.addEventListener('touchend', me.boundOnMouseUp);
            window.addEventListener('blur', me.boundOnMouseUp);
            
            me.applyPinning(state.id)
        }
    }

    /**
     * @param {Event} event
     * @protected
     */
    onMouseUp(event) {
        let me    = this,
            state = me.activeDragId ? me.registrations.get(me.activeDragId) : null;

        if (state) {
            state.isThumbDragging = false;
            me.applyPinning(state.id);
            me.activeDragId = null
        }

        window.removeEventListener('mouseup', me.boundOnMouseUp);
        window.removeEventListener('touchend', me.boundOnMouseUp);
        window.removeEventListener('blur', me.boundOnMouseUp);
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
            me.applyPinning(state.id);
        }
    }

    /**
     * Registers a grid for row scroll pinning and attaches native scroll listener.
     * @param {Object} data
     * @param {String[]} data.bodyIds       The IDs of the grid body nodes
     * @param {String} data.bodyWrapperId The ID of the vertical scroll wrapper
     * @param {String} data.id            Unique identifier for the registration (e.g. ScrollManager id)
     */
    register({bodyIds, bodyWrapperId, id}) {
        let me            = this,
            wrapperNode   = DomAccess.getElement(bodyWrapperId);

        if (wrapperNode && bodyIds.length > 0) {
            me.registrations.set(id, {
                id,
                bodyIds,
                wrapperNode,
                isPinningActive: false,
                isThumbDragging: false,
                scrollTimeoutId: null,
                workerScrollTop: 0
            });

            wrapperNode.addEventListener('scroll', me.boundOnScroll, {passive: true});
            wrapperNode.addEventListener('mousedown', me.boundOnMouseDown);
            wrapperNode.addEventListener('touchstart', me.boundOnMouseDown, {passive: true})
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

        if (state) {
            if (state.wrapperNode) {
                state.wrapperNode.removeEventListener('scroll', me.boundOnScroll);
                state.wrapperNode.removeEventListener('mousedown', me.boundOnMouseDown);
                state.wrapperNode.removeEventListener('touchstart', me.boundOnMouseDown)
            }
            
            // If we unregister while dragging, forcefully clean up global listeners
            if (me.activeDragId === id) {
                me.onMouseUp()
            }

            me.registrations.delete(id)
        }
    }
}

export default Neo.setupClass(GridRowScrollPinning);