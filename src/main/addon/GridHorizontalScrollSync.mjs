import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * @summary Keeps a grid's centre body and header at the horizontal scrollbar's position, in the same frame.
 *
 * The scrollbar is the single source: its scroll moves the body and the header, and a scroll the header makes on its
 * own moves the scrollbar first.
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
                'unregister',
                'unregisterFollower'
            ]
        }
    }

    /**
     * @member {Map<String, Object>} registrations=new Map()
     * @protected
     */
    registrations = new Map()

    /**
     * @summary Routes a scroll the centre header made on its own into the scrollbar, the single source of the
     * horizontal position, so the body follows. The browser scrolls the header by itself when focus lands on a header
     * outside the centre clip.
     *
     * A header scroll that {@link #onScroll} caused is its echo and is ignored. Comparing against the scrollbar's
     * current value instead would pull a scrollbar that moved again since that write back to the older position.
     *
     * So is a header that cannot reach the scrollbar's position: layout clamped it, as a column drop does while its
     * items are out of the flow. Routing that value would scroll the whole grid away.
     * @param {Object} registration
     * @param {Event}  event
     */
    onHeaderScroll(registration, event) {
        let headerNode   = event.target,
            scrollLeft   = headerNode.scrollLeft,
            scrollerNode = DomAccess.getElement(registration.scrollerId);

        if (scrollerNode && scrollLeft !== registration.headerScrollLeft &&
            scrollerNode.scrollLeft <= headerNode.scrollWidth - headerNode.clientWidth + 1) {
            scrollerNode.scrollLeft = scrollLeft
        }
    }

    /**
     * @summary Copies the scrollbar's position onto the centre body, the centre header and, while the grid has header
     * groups, the centre part of its group row.
     * @param {Object} registration
     * @param {Event}  event
     */
    onScroll(registration, event) {
        let scrollerNode    = event.target,
            bodyNode        = DomAccess.getElement(registration.bodyId),
            headerNode      = DomAccess.getElement(registration.headerId),
            groupHeaderNode = registration.groupHeaderId && DomAccess.getElement(registration.groupHeaderId),
            scrollLeft      = scrollerNode.scrollLeft;

        // Synchronously update every node in the identical animation frame
        if (bodyNode)   { bodyNode.style.setProperty('--grid-scroll-left', scrollLeft + 'px'); }
        if (headerNode) {
            headerNode.scrollLeft         = scrollLeft;
            // What the header actually holds: it may clamp a value past its own range
            registration.headerScrollLeft = headerNode.scrollLeft
        }
        // Looked up per scroll: the group row comes and goes with the grid's groups, under one id
        if (groupHeaderNode) { groupHeaderNode.scrollLeft = scrollLeft }

        if (registration.followerIds) {
            for (let followerId of registration.followerIds) {
                DomAccess.getElement(followerId)?.style.setProperty('--grid-scroll-left', scrollLeft + 'px');
            }
        }
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
     * @summary Binds a grid's scrollbar, centre header and wheel listeners, replacing an earlier registration of `id`.
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
            headerScrollLeft: DomAccess.getElement(headerId)?.scrollLeft ?? 0,
            wheelListener   : me.onWheel.bind(me, scrollerId)
        };

        registration.headerScrollListener = me.onHeaderScroll.bind(me, registration);
        registration.scrollListener       = me.onScroll.bind(me, registration);

        scrollerNode = DomAccess.getElement(scrollerId);
        scrollerNode?.addEventListener('scroll', registration.scrollListener);
        DomAccess.getElement(headerId)?.addEventListener('scroll', registration.headerScrollListener);
        DomAccess.getElement(viewId || bodyId)?.addEventListener('wheel', registration.wheelListener, {passive: true});

        if (scrollerNode && registration.followerIds.size > 0) {
            let scrollLeft = scrollerNode.scrollLeft;
            for (let followerId of registration.followerIds) {
                DomAccess.getElement(followerId)?.style.setProperty('--grid-scroll-left', scrollLeft + 'px');
            }
        }

        me.registrations.set(id, registration);
    }

    /**
     * @summary Registers an auxiliary follower row outside grid.body to receive --grid-scroll-left synchronously.
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
                DomAccess.getElement(followerId)?.style.setProperty('--grid-scroll-left', scrollerNode.scrollLeft + 'px');
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
     * @summary Removes every listener {@link #register} bound for `id`.
     * @param {Object} data
     * @param {String} data.id
     */
    unregister({id}) {
        let me           = this,
            registration = me.registrations.get(id);

        if (registration) {
            DomAccess.getElement(registration.scrollerId)?.removeEventListener('scroll', registration.scrollListener);
            DomAccess.getElement(registration.headerId)?.removeEventListener('scroll', registration.headerScrollListener);
            DomAccess.getElement(registration.viewId || registration.bodyId)?.removeEventListener('wheel', registration.wheelListener);
            registration.followerIds?.clear();
            me.registrations.delete(id);
        }
    }
}

export default Neo.setupClass(GridHorizontalScrollSync);
