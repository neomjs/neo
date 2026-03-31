import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
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
     * @param {String} scrollerId
     * @param {String} bodyId
     * @param {String} headerId
     * @param {Event}  event
     */
    onScroll(scrollerId, bodyId, headerId, event) {
        let scrollerNode = event.target,
            bodyNode     = DomAccess.getElement(bodyId),
            headerNode   = DomAccess.getElement(headerId),
            scrollLeft   = scrollerNode.scrollLeft;

        // Synchronously update both nodes in the identical animation frame
        if (bodyNode)   { bodyNode.style.setProperty('--grid-scroll-left', scrollLeft + 'px'); }
        if (headerNode) { headerNode.scrollLeft = scrollLeft; }
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
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.scrollerId
     * @param {String} data.bodyId
     * @param {String} data.headerId
     */
    register({id, scrollerId, bodyId, headerId}) {
        let me = this,
            registration;

        if (me.registrations.has(id)) {
            me.unregister({id});
        }

        registration = {
            id,
            scrollerId,
            bodyId,
            headerId,
            scrollListener: me.onScroll.bind(me, scrollerId, bodyId, headerId),
            wheelListener : me.onWheel.bind(me, scrollerId)
        };

        DomAccess.getElement(scrollerId)?.addEventListener('scroll', registration.scrollListener);
        DomAccess.getElement(bodyId)?.addEventListener('wheel', registration.wheelListener, {passive: true});
        
        me.registrations.set(id, registration);
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    unregister({id}) {
        let me           = this,
            registration = me.registrations.get(id);

        if (registration) {
            DomAccess.getElement(registration.scrollerId)?.removeEventListener('scroll', registration.scrollListener);
            DomAccess.getElement(registration.bodyId)?.removeEventListener('wheel', registration.wheelListener);
            me.registrations.delete(id);
        }
    }
}

export default Neo.setupClass(GridHorizontalScrollSync);
