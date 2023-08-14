import Base from '../../core/Base.mjs';

/**
 * @class Neo.main.addon.ResizeObserver
 * @extends Neo.core.Base
 * @singleton
 */
class ResizeObserver extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.ResizeObserver'
         * @protected
         */
        className: 'Neo.main.addon.ResizeObserver',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }
}

Neo.applyClassConfig(ResizeObserver);

let instance = Neo.applyClassConfig(ResizeObserver);

export default instance;
