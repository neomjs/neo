import Base from '../../core/Base.mjs';

/**
 * @class Neo.code.renderer.Base
 * @extends Neo.core.Base
 * @abstract
 */
class RendererBase extends Base {
    static config = {
        /**
         * @member {String} className='Neo.code.renderer.Base'
         * @protected
         */
        className: 'Neo.code.renderer.Base'
    }

    /**
     * @param {Object} data
     * @param {String} data.code
     * @param {Neo.component.Base} data.container
     * @param {Object} [data.context]
     * @returns {Promise<Object>} The created instances (if any)
     */
    async render(data) {
        return {}
    }
}

export default Neo.setupClass(RendererBase);
