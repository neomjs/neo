import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * @summary This main thread addon is responsible for synchronizing the scroll positions of two DOM nodes.
 *
 * This addon is a key part of Neo.mjs's strategy for creating high-performance, virtualized components like grids and lists.
 * In a multi-threaded environment, the component that renders the data (e.g., the grid body, running in the app worker)
 * is often decoupled from the element that displays the scrollbar (which might be a custom component).
 *
 * By centralizing the scroll event handling in the main thread, `ScrollSync` can efficiently listen to DOM scroll events
 * and update the scroll position of a target node without the need for expensive, high-frequency communication between workers.
 * This makes it essential for implementing custom scrollbars or linking the scroll behavior of separate UI elements.
 *
 * This class manages registrations for scroll synchronization, allowing for both one-way and two-way binding between elements.
 * It uses a granular locking mechanism (`coordinatingNodes`) to prevent infinite "ping-pong" feedback loops
 * when two-way sync is active or when other programmatic scrolling addons (like `GridDragScroll`) mutate the DOM.
 *
 * Key concepts: scroll synchronization, custom scrollbar, virtual scrolling, grid, main thread addon, DOM manipulation, event handling.
 *
 * @class Neo.main.addon.ScrollSync
 * @extends Neo.main.addon.Base
 * @see Neo.grid.VerticalScrollbar
 * @see Neo.grid.Container
 */
class ScrollSync extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.ScrollSync'
         * @protected
         */
        className: 'Neo.main.addon.ScrollSync',
        /**
         * Time in ms to hold the scroll lock after a programmatic mutation.
         * Must be long enough to survive asynchronous native scroll event dispatches.
         * @member {Number} lockTimeout=50
         */
        lockTimeout: 50,
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
     * Keeps track of which DOM node IDs are currently being mutated by ScrollSync.
     * The Map stores the active `setTimeout` ID for each locked node.
     * If an ID is in this Map, incoming native scroll events from that node are ignored
     * because we know we caused them.
     * @member {Map<String, Number>} coordinatingNodes=new Map()
     * @protected
     */
    coordinatingNodes = new Map()
    /**
     * @member {Map<String, Object>} registrations=new Map()
     * @protected
     */
    registrations = new Map()

    /**
     * Creates and attaches a scroll event listener to a DOM node.
     * @param {String} fromId      - The ID of the DOM node to listen to for scroll events.
     * @param {String} toId        - The ID of the DOM node to scroll when the event is fired.
     * @param {String} direction   - The scroll direction to sync ('vertical', 'horizontal', or 'both').
     * @param {Boolean} isSyncBack - True if this listener is for the sync back in a two-way binding.
     * @returns {Function|null} The created listener function, or null if the element does not exist.
     */
    addScrollListener(fromId, toId, direction, isSyncBack) {
        let listener = this.onScroll.bind(this, toId, direction, isSyncBack);
        DomAccess.getElement(fromId)?.addEventListener('scroll', listener);
        return listener
    }

    /**
     * Locks a node ID to prevent its native scroll events from triggering ping-pong loops.
     * Uses a debounced timeout to ensure the lock survives continuous 16ms momentum loops.
     * @param {String} nodeId
     * @protected
     */
    lockNode(nodeId) {
        let me = this;

        if (me.coordinatingNodes.has(nodeId)) {
            clearTimeout(me.coordinatingNodes.get(nodeId))
        }

        me.coordinatingNodes.set(nodeId, setTimeout(() => {
            me.coordinatingNodes.delete(nodeId)
        }, me.lockTimeout))
    }

    /**
     * The main event handler for scroll events.
     * It programmatically scrolls the target node (`toId`) based on the scroll position of the source node (`event.target`).
     * Uses `coordinatingNodes` to prevent feedback loops.
     * @param {String} toId
     * @param {String} direction
     * @param {Boolean} isSyncBack
     * @param {Event}  event
     */
    onScroll(toId, direction, isSyncBack, event) {
        let me     = this,
            fromId = event.target.id;

        // GATEKEEPER: If the source node is currently locked by a programmatic mutation, ignore this event.
        if (me.coordinatingNodes.has(fromId)) {
            return
        }

        let node                    = DomAccess.getElement(toId),
            {scrollLeft, scrollTop} = event.target;

        if (node) {
            // Lock the target node we are about to mutate to prevent it from ping-ponging back
            me.lockNode(toId);

            if (direction === 'both') {
                node.scrollTo({
                    behavior: 'instant',
                    left    : scrollLeft,
                    top     : scrollTop
                })
            } else if (direction === 'horizontal') {
                node.scrollLeft = scrollLeft
            } else if (direction === 'vertical') {
                node.scrollTop = scrollTop
            }
        }
    }

    /**
     * Registers a scroll synchronization between two DOM nodes.
     * The method is idempotent: calling it multiple times with the same `id` will not create duplicate listeners.
     * If the registration parameters have changed, the old registration will be removed and a new one will be created.
     * @param {Object}  data
     * @param {String}  direction='vertical' 'horizontal', 'vertical' or 'both'
     * @param {String}  fromId
     * @param {String}  id                   A unique identifier for this registration.
     * @param {String}  toId
     * @param {Boolean} twoWay=true          Sync the target's scroll state back to the source node
     */
    register({direction='vertical', fromId, id, toId, twoWay=true}) {
        let me = this,
            registration;

        // Ensure idempotency: if the exact same registration already exists, do nothing.
        // If a registration with the same ID but different parameters exists, unregister the old one first.
        if (me.registrations.has(id)) {
            const oldReg = me.registrations.get(id);
            if (oldReg.direction === direction && oldReg.fromId === fromId && oldReg.toId === toId && oldReg.twoWay === twoWay) {
                return
            }
            me.unregister({id})
        }

        registration = {
            direction,
            fromId,
            id,
            toId,
            twoWay,
            listeners: []
        };

        registration.listeners.push({
            listener: me.addScrollListener(fromId, toId, direction, false),
            fromId
        });

        if (twoWay) {
            registration.listeners.push({
                listener: me.addScrollListener(toId, fromId, direction, true),
                fromId  : toId
            })
        }

        me.registrations.set(id, registration)
    }

    /**
     * Programmatically drives the scroll state for a registered connection without triggering feedback loops.
     * Expected to be called by other Main Thread Addons (like GridDragScroll).
     * @param {String} id         The registration ID
     * @param {Number} scrollLeft
     * @param {Number} scrollTop
     */
    syncTo(id, scrollLeft, scrollTop) {
        let me           = this,
            registration = me.registrations.get(id);

        if (!registration) {
            return
        }

        let {fromId, toId}   = registration,
            fromNode         = DomAccess.getElement(fromId),
            toNode           = DomAccess.getElement(toId);

        // Lock both nodes involved in this registration
        me.lockNode(fromId);
        me.lockNode(toId);

        if (fromNode) {
            if (scrollLeft !== undefined) fromNode.scrollLeft = scrollLeft;
            if (scrollTop  !== undefined) fromNode.scrollTop  = scrollTop;
        }

        if (toNode) {
            if (scrollLeft !== undefined) toNode.scrollLeft = scrollLeft;
            if (scrollTop  !== undefined) toNode.scrollTop  = scrollTop;
        }
    }

    /**
     * Removes a scroll synchronization registration.
     * This method is safe to call even if the DOM nodes have already been removed.
     * @param {Object} data
     * @param {String} data.id The unique identifier for the registration to remove.
     */
    unregister({id}) {
        let me           = this,
            registration = me.registrations.get(id);

        if (registration) {
            // It is safe to call removeEventListener even if the element does not exist anymore.
            registration.listeners.forEach(item => {
                DomAccess.getElement(item.fromId)?.removeEventListener('scroll', item.listener)
            });

            // Remove the registration from the map to prevent memory leaks.
            me.registrations.delete(id)
        }
    }
}

export default Neo.setupClass(ScrollSync);
