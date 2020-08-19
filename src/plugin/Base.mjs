import {default as CoreBase} from '../core/Base.mjs';

/**
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
        console.log('plugin.Base ctor');
    }
}

Neo.applyClassConfig(Base);

export {Base as default};