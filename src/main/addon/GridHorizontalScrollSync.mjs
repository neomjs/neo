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
        if (bodyNode)   { bodyNode.scrollLeft = scrollLeft; }
        if (headerNode) { headerNode.scrollLeft = scrollLeft; }
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
            listener: me.onScroll.bind(me, scrollerId, bodyId, headerId)
        };

        DomAccess.getElement(scrollerId)?.addEventListener('scroll', registration.listener);
        
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
            DomAccess.getElement(registration.scrollerId)?.removeEventListener('scroll', registration.listener);
            me.registrations.delete(id);
        }
    }
}

export default Neo.setupClass(GridHorizontalScrollSync);
