import Base from './Base.mjs';

/**
 * Basic Read and write access for document.head
 * @class Neo.main.addon.DocumentHead
 * @extends Neo.main.addon.Base
 */
class Cookie extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.DocumentHead'
         * @protected
         */
        className: 'Neo.main.addon.DocumentHead',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         * @reactive
         */
        remote: {
            app: [
                'getTitle',
                'setTitle'
            ]
        }
    }

    /**
     * @returns {String}
     */
    getTitle() {
        return document.title
    }

    /**
     * @param {Object} data
     * @param {String} data.value
     */
    setTitle({value}) {
        document.title = value
    }
}

export default Neo.setupClass(Cookie);
