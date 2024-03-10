import Base from './Base.mjs';

/**
 * Creating IntersectionObserver to get infos about DOM node visibility.
 * See: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
 * @class Neo.main.addon.IntersectionObserver
 * @extends Neo.main.addon.Base
 */
class NeoIntersectionObserver extends Base {
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
                'register'
            ]
        }
    }

    callback() {
        console.log('callback', arguments);
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.observe The querySelector to match elements
     * @param {String} data.root
     * @param {String} data.rootMargin='0px'
     * @param {Number|Number[]} data.threshold=1.0
     */
    register(data) {
        console.log('register', data.root);

        let me = this,

        observer = new IntersectionObserver(me.callback.bind(me), {
            root      : document.querySelector(data.root),
            rootMargin: data.rootMargin || '0px',
            threshold : data.threshold  || 1.0
        });

        observer.observe(document.querySelector(data.observe));
        console.log(observer);
    }
}

Neo.setupClass(NeoIntersectionObserver);

export default NeoIntersectionObserver;
