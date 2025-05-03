import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * Syncs the scroll state of 2 DOM nodes
 * @class Neo.main.addon.ScrollSync
 * @extends Neo.main.addon.Base
 */
class ScrollSync extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.ScrollSync'
         * @protected
         */
        className: 'Neo.main.addon.ScrollSync',
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
     * @param {String} fromId
     * @param {String} toId
     * @param {String} direction
     */
    addScrollListener(fromId, toId, direction) {
        DomAccess.getElement(fromId)?.addEventListener('scroll', this.onScroll.bind(this, toId, direction))
    }

    /**
     * @param {String} toId
     * @param {String} direction
     * @param {Event}  event
     */
    onScroll(toId, direction, event) {
        let node                    = DomAccess.getElement(toId),
            {scrollLeft, scrollTop} = event.target;

        if (node) {
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
     * @param {Object}  data
     * @param {String}  direction='vertical' 'horizontal', 'vertical' or 'both'
     * @param {String}  fromId
     * @param {String}  id                   The owner id (e.g. component id)
     * @param {String}  toId
     * @param {Boolean} twoWay=true          Sync the target's scroll state back to the source node
     */
    register({direction='vertical', fromId, id, toId, twoWay=true}) {
        let me = this;

        me.addScrollListener(fromId, toId, direction);

        if (twoWay) {
            me.addScrollListener(toId, fromId, direction)
        }
    }

    /**
     * @param {Object} data
     */
    unregister(data) {
        console.log('unregister', data)
    }
}

export default Neo.setupClass(ScrollSync);
