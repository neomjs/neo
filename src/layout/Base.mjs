import {default as CoreBase} from '../core/Base.mjs';

/**
 * The base class for all other layouts.
 * Use it directly in case you want to create a container without a layout.
 * @class Neo.layout.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.layout.Base'
         * @private
         */
        className: 'Neo.layout.Base',
        /**
         * @member {String} ntype='layout-base'
         * @private
         */
        ntype: 'layout-base',
        /**
         * The Id of the Container instance this layout is bound to
         * @member {?String} containerId=null
         * @private
         */
        containerId: null,
        /**
         * Identifier for all classes that extend layout.Base
         * @member {Boolean} isLayout=true
         * @private
         */
        isLayout: true
    }}

    /**
     * Placeholder Method
     * @param {Neo.component.Base} item
     * @private
     */
    applyChildAttributes(item) {}

    /**
     * Placeholder Method
     * @private
     */
    applyRenderAttributes() {}

    /**
     * Placeholder Method
     * @param {Neo.component.Base} item
     * @private
     */
    removeChildAttributes(item) {}

    /**
     * Placeholder Method
     * @private
     */
    removeRenderAttributes() {}
}

Neo.applyClassConfig(Base);

export {Base as default};