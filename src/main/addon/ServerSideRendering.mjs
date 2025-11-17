import Base from './Base.mjs';

/**
 * This addon gets auto-imported when the application is running in SSR mode.
 * Its primary responsibility is to perform client-side cleanup tasks related to Server-Side Rendering,
 * such as removing the SSR data script tag from the DOM after the initial hydration.
 * In the future, it can be extended to handle other SSR-specific client-side logic.
 * @class Neo.main.addon.ServerSideRendering
 * @extends Neo.main.addon.Base
 */
class ServerSideRendering extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.ServerSideRendering'
         * @protected
         */
        className: 'Neo.main.addon.ServerSideRendering'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        // Remove the SSR script tag from the DOM after the client-side application has consumed the SSR data.
        document.querySelector('script[data-neo-ssr-script="true"]')?.remove()
    }
}

export default Neo.setupClass(ServerSideRendering);
