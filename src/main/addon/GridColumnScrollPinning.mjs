import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * @summary Main Thread Addon for High-Performance Grid Column Scroll Pinning (Synchronous Engine).
 *
 * This addon uses a Synchronous Scroll Listener architecture to prevent visual
 * column tearing during rapid horizontal scrolling.
 *
 * **The Synchronous Architecture:**
 * 1.  **Scroll Driven:** A native `scroll` listener on the Grid Container triggers the logic.
 * 2.  **Synchronous Injection:** The scroll event synchronously calculates `scrollLeft` and
 *     immediately applies CSS custom properties (`--grid-locked-start-offset`, `--grid-locked-end-offset`)
 *     to the root container node. This ensures the optical pinning is injected perfectly in phase
 *     with the native scroll event, before the browser paints the next frame.
 *
 * @class Neo.main.addon.GridColumnScrollPinning
 * @extends Neo.main.addon.Base
 */
class GridColumnScrollPinning extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.GridColumnScrollPinning'
         * @protected
         */
        className: 'Neo.main.addon.GridColumnScrollPinning',
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
     * Stores state per registered Grid Container.
     * Shape: { id, containerId, containerNode }
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
     * Re-calculates and applies pinning offsets based on the actual horizontal scroll position.
     *
     * @param {Object} state Registration state object
     * @protected
     */
    applyPinning(state) {
        let node                                   = state.containerNode,
            {clientWidth, scrollLeft, scrollWidth} = node;

        // Apply CSS variables to the root container node for inheritance
        node.style.setProperty('--grid-locked-start-offset', `${scrollLeft}px`);
        node.style.setProperty('--grid-locked-end-offset',   `${scrollLeft - (scrollWidth - clientWidth)}px`);

        state.ticking = false;
    }

    /**
     * Triggered by native browser scroll. Uses rAF to batch style recalculations.
     * @param {Event} event
     * @protected
     */
    onScroll(event) {
        let me            = this,
            containerNode = event.target,
            state;

        // Find which registration this scroll event belongs to based on the container node
        for (const reg of me.registrations.values()) {
            if (reg.containerNode === containerNode) {
                state = reg;
                break
            }
        }

        if (state && !state.ticking) {
            state.ticking = true;
            requestAnimationFrame(() => me.applyPinning(state));
        }
    }

    /**
     * Registers a grid for column scroll pinning and attaches native scroll listener.
     * @param {Object} data
     * @param {String} data.containerId The ID of the grid container
     * @param {String} data.id          Unique identifier for the registration (e.g. ScrollManager id)
     */
    register({containerId, id}) {
        let me            = this,
            containerNode = DomAccess.getElement(containerId);

        if (containerNode) {
            me.registrations.set(id, {
                id,
                containerId,
                containerNode,
                ticking: false
            });

            containerNode.addEventListener('scroll', me.boundOnScroll, {passive: true});

            // Apply initial state
            me.applyPinning(me.registrations.get(id))
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
            if (state.containerNode) {
                state.containerNode.removeEventListener('scroll', me.boundOnScroll)
            }

            me.registrations.delete(id)
        }
    }
}

export default Neo.setupClass(GridColumnScrollPinning);
