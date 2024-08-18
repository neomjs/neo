import CoreBase from '../core/Base.mjs';

/**
 * Abstract base class for plugin implementations.
 * Plugins are intended to get put into the plugins config of component.Base
 * to enhance them or add additional features
 * @class Neo.plugin.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    static config = {
        /**
         * @member {String} className='Neo.plugin.Base'
         * @protected
         */
        className: 'Neo.plugin.Base',
        /**
         * All plugin ntypes need to start with 'plugin-' to ensure that component.Base: getPlugin() can find them
         * @member {String} ntype='plugin'
         * @protected
         */
        ntype: 'plugin',
        /**
         * @member {Neo.component.Base} owner=null
         * @protected
         */
        owner: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (me.owner.mounted) {
            me.onOwnerMounted();
        } else {
            me.owner.on('mounted', me.onOwnerMounted, me);
        }
    }

    /**
     * Override this method to apply changes to the owner Component when it does get mounted
     */
    onOwnerMounted() {

    }
}

export default Neo.setupClass(Base);
