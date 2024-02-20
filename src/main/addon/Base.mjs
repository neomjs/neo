import CoreBase from '../../core/Base.mjs';

/**
 * Base class for main thread addons
 * @class Neo.main.addon.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.Base'
         * @protected
         */
        className: 'Neo.main.addon.Base',
        /**
         * An identifier for core.Base to get handled like singletons for remote method access
         * @member {Boolean} isMainThreadAddon=true
         * @protected
         */
        isMainThreadAddon: true
    }
}

Neo.setupClass(Base);

export default Base;
