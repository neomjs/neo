import Base from '../container/Base.mjs';

/**
 * @class Neo.container.Dialog
 * @extends Neo.container.Base
 */
class Dialog extends Base {
    static config = {
        /**
         * @member {String} className='Neo.container.Dialog'
         * @protected
         */
        className: 'Neo.container.Dialog',
        /**
         * @member {Object[]} items
         */
        items: []
    }
}

Neo.applyClassConfig(Dialog);

export default Dialog;
