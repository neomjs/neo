import Base from '../manager/Base.mjs';

/**
 * @class Neo.manager.ToastDialog
 * @extends Neo.manager.Base
 * @singleton
 */
class ToastDialog extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.manager.ToastDialog'
         * @protected
         */
        className: 'Neo.manager.ToastDialog',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}
}

Neo.applyClassConfig(ToastDialog);

let instance = Neo.create(ToastDialog);

Neo.applyToGlobalNs(instance);

export default instance;
