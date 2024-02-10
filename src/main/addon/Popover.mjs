import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * Addon for Popover
 * @class Neo.main.addon.Popover
 * @extends Neo.main.addon.Base
 */
class Popover extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.Popover'
         * @protected
         */
        className: 'Neo.main.addon.Popover',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'hide',
                'show',
                'toggle'
            ]
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @returns {Boolean}
     */
    hide(data) {
        this.getPopover(data.id).hidePopover();
        return true;
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @returns {Boolean}
     */
    show(data) {
        this.getPopover(data.id).showPopover();
        return true;
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @returns {Boolean}
     */
    toggle(data) {
        this.getPopover(data.id).togglePopover();
        return true;
    }

    getPopover(parentId) {
        const parent = document.getElementById(parentId),
              popover = document.getElementById(parent.getAttribute('popovertarget'));

        return popover;
    }
}

Neo.applyClassConfig(Popover);

export default Popover;
