import Base from './Base.mjs';

/**
 * Creating IntersectionObserver to get infos about DOM node visibility.
 * See: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
 * @class Neo.main.addon.IntersectionObserver
 * @extends Neo.main.addon.Base
 */
class IntersectionObserver extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.IntersectionObserver'
         * @protected
         */
        className: 'Neo.main.addon.IntersectionObserver',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'create'
            ]
        }
    }

    /**
     * @param {String} value
     */
    create(value) {
        console.log('create')
    }
}

Neo.setupClass(IntersectionObserver);

export default IntersectionObserver;
