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
                'unregister'
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
     * @param {Object} registration
     * @param {Event}  event
     */
    onHeaderScroll(registration, event) {
        let scrollLeft   = event.target.scrollLeft,
            scrollerNode = DomAccess.getElement(registration.scrollerId);

        if (scrollerNode && scrollLeft !== registration.headerScrollLeft) {
            scrollerNode.scrollLeft = scrollLeft
        }
    }

    /**
     * @summary Copies the scrollbar's position onto the centre body and header.
     * @param {Object} registration
     * @param {Event}  event
     */
    onScroll(registration, event) {
        let scrollerNode = event.target,
            bodyNode     = DomAccess.getElement(registration.bodyId),
            headerNode   = DomAccess.getElement(registration.headerId),
            scrollLeft   = scrollerNode.scrollLeft;

        // Synchronously update both nodes in the identical animation frame
        if (bodyNode)   { bodyNode.style.setProperty('--grid-scroll-left', scrollLeft + 'px'); }
        if (headerNode) {
            headerNode.scrollLeft         = scrollLeft;
            // What the header actually holds: it may clamp a value past its own range
            registration.headerScrollLeft = headerNode.scrollLeft
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
     */
    register({id, scrollerId, bodyId, viewId, headerId}) {
        let me = this,
            registration;

        if (me.registrations.has(id)) {
            me.unregister({id});
        }

        registration = {
            id,
            scrollerId,
            bodyId,
            viewId,
            headerId,
            headerScrollLeft: DomAccess.getElement(headerId)?.scrollLeft ?? 0,
            wheelListener   : me.onWheel.bind(me, scrollerId)
        };

        registration.headerScrollListener = me.onHeaderScroll.bind(me, registration);
        registration.scrollListener       = me.onScroll.bind(me, registration);

        DomAccess.getElement(scrollerId)?.addEventListener('scroll', registration.scrollListener);
        DomAccess.getElement(headerId)?.addEventListener('scroll', registration.headerScrollListener);
        DomAccess.getElement(viewId || bodyId)?.addEventListener('wheel', registration.wheelListener, {passive: true});

        me.registrations.set(id, registration);
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
            me.registrations.delete(id);
        }
    }
}

export default Neo.setupClass(GridHorizontalScrollSync);
