import Base from '../../../src/core/Base.mjs';

/**
 * @class Portal.canvas.Helper
 * @extends Neo.core.Base
 * @singleton
 */
class Helper extends Base {
    static config = {
        /**
         * @member {String} className='Portal.canvas.Helper'
         * @protected
         */
        className: 'Portal.canvas.Helper',
        /**
         * Remote method access
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'importFooterCanvas',
                'importHomeCanvas',
                'importServicesCanvas',
                'importTimelineCanvas'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @returns {Promise<void>}
     */
    async importFooterCanvas() {
        let module = await import('./FooterCanvas.mjs');
        await module.default.remotesReady()
    }

    /**
     * @returns {Promise<void>}
     */
    async importHomeCanvas() {
        let module = await import('./HomeCanvas.mjs');
        await module.default.remotesReady()
    }

    /**
     * @returns {Promise<void>}
     */
    async importServicesCanvas() {
        let module = await import('./ServicesCanvas.mjs');
        await module.default.remotesReady()
    }

    /**
     * @returns {Promise<void>}
     */
    async importTimelineCanvas() {
        let module = await import('./TimelineCanvas.mjs');
        await module.default.remotesReady()
    }
}

export default Neo.setupClass(Helper);
