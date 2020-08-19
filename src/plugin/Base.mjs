import {default as CoreBase} from '../core/Base.mjs';

/**
 * Plugins are intended to get put into the plugins config of component.Base
 * to enhance them or add additional features
 * @class Neo.plugin.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.plugin.Base'
         * @protected
         */
        className: 'Neo.plugin.Base',
        /**
         * @member {String} ntype='plugin'
         * @protected
         */
        ntype: 'plugin',
        /**
         * @member {Neo.component.Base} owner=null
         * @protected
         */
        owner: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.owner.on('mounted', me.onOwnerMounted, me);
    }

    /**
     * Override this method to apply changes to the owner Component when it does get mounted
     */
    onOwnerMounted() {

    }
}

Neo.applyClassConfig(Base);

export {Base as default};