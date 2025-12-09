import Base from '../../core/Base.mjs';

/**
 * @summary Abstract base class for all LivePreview code renderers.
 *
 * This class defines the interface and common functionality for the pluggable renderer system used by `Neo.code.LivePreview`.
 * It implements the **Strategy Pattern**, allowing the LivePreview component to switch execution logic based on the
 * selected language (e.g., Neo.mjs, Markdown) without coupling to specific implementations.
 *
 * Subclasses must implement the `render()` method to handle the transformation of source code into UI components.
 *
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
     * Optional method for renderers that manage their own child components.
     * Should destroy all internally tracked components.
     */
    destroyComponents() {}

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

    /**
     * Optional method for renderers that manage their own child components.
     * Should update the 'mounted' state of tracked components.
     * @param {Boolean} mounted
     */
    updateComponentState(mounted) {}
}

export default Neo.setupClass(RendererBase);
