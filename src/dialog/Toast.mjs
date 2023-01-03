import Base         from './Base.mjs';
import ToastManager from '../manager/ToastDialog.mjs';

/**
 * @class Neo.dialog.Toast
 * @extends Neo.dialog.Base
 */
class Toast extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.dialog.Toast'
         * @protected
         */
        className: 'Neo.dialog.Toast'
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        ToastManager.register(this);
    }
}

Neo.applyClassConfig(Toast);

export default Toast;
