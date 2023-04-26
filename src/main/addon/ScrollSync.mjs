import Base from '../../core/Base.mjs';

/**
 * @class Neo.main.addon.ScrollSync
 * @extends Neo.core.Base
 * @singleton
 */
class ScrollSync extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.ScrollSync'
         * @protected
         */
        className: 'Neo.main.addon.ScrollSync',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }
}

Neo.applyClassConfig(ScrollSync);

let instance = Neo.create(ScrollSync);

Neo.applyToGlobalNs(instance);

export default instance;
