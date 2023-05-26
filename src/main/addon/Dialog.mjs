import Base      from '../../core/Base.mjs';
import DomAccess from '../DomAccess.mjs'
/**
 * Addon for component.Dialog
 * @class Neo.main.addon.Dialog
 * @extends Neo.core.Base
 * @singleton
 */
class Dialog extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.Dialog'
         * @protected
         */
        className: 'Neo.main.addon.Dialog',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'close',
                'show',
                'showModal'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @returns {Boolean}
     */
    close(data) {
        DomAccess.getElement(data.id).close()
        return true;
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @returns {Boolean}
     */
    show(data) {
        DomAccess.getElement(data.id).show()
        return true;
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @returns {Boolean}
     */
    showModal(data) {
        DomAccess.getElement(data.id).showModal()
        return true;
    }
}

let instance = Neo.applyClassConfig(Dialog);

export default instance;