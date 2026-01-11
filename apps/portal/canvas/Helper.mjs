import Base from '../../../src/core/Base.mjs';

/**
 * @class Portal.canvas.Helper
 * @extends Neo.core.Base
 * @singleton
 */
class Blackboard extends Base {
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
                'importTicketCanvas'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     *
     */
    importTicketCanvas() {
        import('./TicketCanvas.mjs')
    }
}

export default Neo.setupClass(Blackboard);
