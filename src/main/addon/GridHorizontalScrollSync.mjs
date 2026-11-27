import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * @summary Keeps a grid's centre body and header at the horizontal scrollbar's position, in the same frame.
 *
 * The scrollbar is the single source: its scroll moves the body and the header, and a scroll the header makes on its
 * own moves the scrollbar first.
 *
 * The addon listens to the document once and routes each `scroll` and `wheel` by the Neo id of a registered node
 * (`DomAccess.getNodeId()`, for either DOM identity mode). A grid may register before its nodes are in the document,
 * since the App worker's call can arrive ahead of the VDom worker's delta, and a node replaced later keeps its sync.
 * @class Neo.main.addon.GridHorizontalScrollSync
 * @extends Neo.main.addon.Base
 */
class GridHorizontalScrollSync extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.GridHorizontalScrollSync'
         * @protected
         */
        className: 'Neo.main.addon.GridHorizontalScrollSync',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'register',
                'registerFollower',
                'sync',
                'unregister',
                'unregisterFollower'
            ]
        }
    }

    /**
     * The registered nodes by id, each with its registration and its role: `header`, `scroller` or `view`.
     * @member {Map<String, Object>} nodes=new Map()
     * @protected
     */
    nodes = new Map()
    /**
     * @member {Map<String, Object>} registrations=new Map()
     * @protected
     */
    registrations = new Map()

    /**
     * @summary Listens to the document's `scroll` events in the capture phase, since a scroll does not bubble, and to
     * `wheel` events as they bubble, so a nested control that consumes a wheel keeps it from the grid.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Neo.bindMethods(me, ['onDocumentScroll', 'onDocumentWheel']);

        document.addEventListener('scroll', me.onDocumentScroll, {capture: true});
        document.addEventListener('wheel',  me.onDocumentWheel,  {passive: true})
    }

    /**
     * @summary Stops listening to the document.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        document.removeEventListener('scroll', me.onDocumentScroll, {capture: true});
        document.removeEventListener('wheel',  me.onDocumentWheel);

        super.destroy(...args)
    }

    /**
     * @summary Routes the scroll of a registered scrollbar to {@link #onScroll} and that of a registered centre header
     * to {@link #onHeaderScroll}.
     * @param {Event} event
     */
    onDocumentScroll(event) {
        let node = this.nodes.get(DomAccess.getNodeId(event.target));

        if (node?.role === 'scroller') {
            this.onScroll(node.registration, event)
        } else if (node?.role === 'header') {
            this.onHeaderScroll(node.registration, event)
        }
    }

    /**
     * @summary Routes a wheel to {@link #onWheel} for every registered view on its path.
     * @param {Event} event
     */
    onDocumentWheel(event) {
        let node;

        for (const element of event.composedPath()) {
            node = this.nodes.get(DomAccess.getNodeId(element));
            node?.role === 'view' && this.onWheel(node.registration.scrollerId, event)
        }
    }

    /**
     * @summary Routes a scroll the centre header made on its own into the scrollbar, the single source of the
     * horizontal position, so the body follows. The browser scrolls the header by itself when focus lands on a header
     * outside the centre clip.
     *
     * A header scroll that {@link #onScroll} caused is its echo and is ignored. Comparing against the scrollbar's
     * current value instead would pull a scrollbar that moved again since that write back to the older position.
     *
     * So is a header that cannot reach the scrollbar's position: layout clamped it, as a column drop does while its
     * items are out of the flow. Routing that value would scroll the whole grid away. Layout also clamps a header
     * whose content shrank under the position written last, as a zoom out does, even where the scrollbar has moved
     * inside the header's range since: the header takes the scrollbar's position back.
     * @param {Object} registration
     * @param {Event}  event
     */
    onHeaderScroll(registration, event) {
        let headerNode   = event.target,
            scrollLeft   = headerNode.scrollLeft,
            maxLeft      = headerNode.scrollWidth - headerNode.clientWidth + 1,
            scrollerNode = DomAccess.getElement(registration.scrollerId);

        if (!scrollerNode || scrollLeft === registration.headerScrollLeft) {
            return
        }

        if (registration.headerScrollLeft > maxLeft) {
            headerNode.scrollLeft         = scrollerNode.scrollLeft;
            registration.headerScrollLeft = headerNode.scrollLeft
        } else if (scrollerNode.scrollLeft <= maxLeft) {
            scrollerNode.scrollLeft = scrollLeft
        }
    }

    /**
     * @summary Moves the grid to its scrollbar's new position, see {@link #syncFromScroller}.
     * @param {Object} registration
     * @param {Event}  event
     */
    onScroll(registration, event) {
        this.syncFromScroller(registration, event.target)
    }

    /**
     * @param {String} scrollerId
     * @param {Event}  event
     */
    onWheel(scrollerId, event) {
        // Only trigger update if there is horizontal movement
        if (Math.abs(event.deltaX) > 0) {
            let scrollerNode = DomAccess.getElement(scrollerId);
            if (scrollerNode) {
                // Adjust scrollbar by deltaX, triggering its native 'scroll' event.
                scrollerNode.scrollLeft += event.deltaX;
            }
        }
    }

    /**
     * @summary Registers a grid's scrollbar, centre header and view, replacing an earlier registration of `id`. The
     * nodes need not be in the document yet: {@link #onDocumentScroll} and {@link #onDocumentWheel} find them by id.
     * A scrollbar that is in the document takes its grid to its position at once: this addon loads on demand, so a
     * scroll before the registration reached the App worker but no listener here.
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.scrollerId
     * @param {String} data.bodyId
     * @param {String} data.viewId
     * @param {String} data.headerId
     * @param {String[]} [data.followerIds] Optional follower row element ids mounted outside grid.body
     * @param {String} [data.groupHeaderId] The centre part of the grid's header group row, present only while the grid
     * has header groups
     */
    register({id, scrollerId, bodyId, viewId, headerId, groupHeaderId, followerIds}) {
        let me = this,
            registration, scrollerNode;

        if (me.registrations.has(id)) {
            me.unregister({id});
        }

        registration = {
            id,
            scrollerId,
            bodyId,
            viewId,
            headerId,
            groupHeaderId,
            followerIds     : new Set(followerIds || []),
            headerScrollLeft: DomAccess.getElement(headerId)?.scrollLeft ?? 0
        };

        me.nodes.set(scrollerId,       {registration, role: 'scroller'});
        me.nodes.set(headerId,         {registration, role: 'header'});
        me.nodes.set(viewId || bodyId, {registration, role: 'view'});

        scrollerNode = DomAccess.getElement(scrollerId);
        scrollerNode && me.syncFromScroller(registration, scrollerNode);

        me.registrations.set(id, registration);
    }

    /**
     * @summary Registers an auxiliary follower row outside grid.body to receive --neo-grid-scroll-left synchronously.
     * Seeds its initial position if the scroller node is available.
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.followerId
     */
    registerFollower({id, followerId}) {
        let me           = this,
            registration = me.registrations.get(id);

        if (registration) {
            registration.followerIds.add(followerId);

            let scrollerNode = DomAccess.getElement(registration.scrollerId);
            if (scrollerNode) {
                DomAccess.getElement(followerId)?.style.setProperty('--neo-grid-scroll-left', scrollerNode.scrollLeft + 'px');
            }
        }
    }

    /**
     * @summary Re-applies the registered scrollbar's live `scrollLeft` onto its header, body and followers.
     * @param {Object} data
     * @param {String} data.id
     */
    sync({id}) {
        let registration = this.registrations.get(id),
            scrollerNode = registration && DomAccess.getElement(registration.scrollerId);

        scrollerNode && this.syncFromScroller(registration, scrollerNode)
    }

    /**
     * @summary Copies the scrollbar's position onto the centre body, the centre header, every registered follower
     * row outside grid.body (`registration.followerIds`) and, while the grid has header groups, the centre part of
     * its group row.
     * @param {Object}      registration
     * @param {HTMLElement} scrollerNode
     */
    syncFromScroller(registration, scrollerNode) {
        let bodyNode        = DomAccess.getElement(registration.bodyId),
            headerNode      = DomAccess.getElement(registration.headerId),
            groupHeaderNode = registration.groupHeaderId && DomAccess.getElement(registration.groupHeaderId),
            scrollLeft      = scrollerNode.scrollLeft;

        // Synchronously update every node in the identical animation frame
        if (bodyNode)   { bodyNode.style.setProperty('--neo-grid-scroll-left', scrollLeft + 'px'); }
        if (headerNode) {
            headerNode.scrollLeft         = scrollLeft;
            // What the header actually holds: it may clamp a value past its own range
            registration.headerScrollLeft = headerNode.scrollLeft
        }
        // Looked up per scroll: the group row comes and goes with the grid's groups, under one id
        if (groupHeaderNode) { groupHeaderNode.scrollLeft = scrollLeft }

        if (registration.followerIds) {
            for (let followerId of registration.followerIds) {
                DomAccess.getElement(followerId)?.style.setProperty('--neo-grid-scroll-left', scrollLeft + 'px');
            }
        }
    }

    /**
     * @summary Unregisters an auxiliary follower row from receiving horizontal scroll sync updates.
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.followerId
     */
    unregisterFollower({id, followerId}) {
        let me           = this,
            registration = me.registrations.get(id);

        if (registration) {
            registration.followerIds.delete(followerId);
        }
    }

    /**
     * @summary Ends the sync of the grid registered as `id`. A node another registration took over keeps that one.
     * @param {Object} data
     * @param {String} data.id
     */
    unregister({id}) {
        let me           = this,
            registration = me.registrations.get(id);

        if (registration) {
            [registration.scrollerId, registration.headerId, registration.viewId || registration.bodyId].forEach(nodeId => {
                me.nodes.get(nodeId)?.registration === registration && me.nodes.delete(nodeId)
            });

            me.registrations.delete(id);
        }
    }
}

export default Neo.setupClass(GridHorizontalScrollSync);
