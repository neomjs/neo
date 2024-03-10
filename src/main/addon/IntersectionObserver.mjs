import Base      from './Base.mjs';
import DomEvents from '../DomEvents.mjs';

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

    /**
     *
     * @param {IntersectionObserverEntry[]} entries
     * @param {IntersectionObserver} observer
     */
    callback(entries, observer) {
        entries.forEach(entry => {
            const target = entry.target;

            if (entry.isIntersecting) {
                if (target.getBoundingClientRect().y < 200) {
                    console.log(entry.target.id);
                    console.log(entry.target.innerText);
                    console.log(entry.isIntersecting);
                    console.log(entry.target.getBoundingClientRect());
                    console.log(entry);
                    console.log(observer);

                    let path = DomEvents.getPathFromElement(entry.target).map(e => DomEvents.getTargetData(e));

                    Neo.worker.Manager.sendMessage('app', {
                        action   : 'domEvent',
                        eventName: 'intersect',
                        data: {
                            id            : observer.rootId,
                            isIntersecting: true,
                            path,
                            targetId      : target.id
                        }
                    })
                }
            }
        })
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

        /*observer = new IntersectionObserver(me.callback.bind(me), {
            //root      : document.querySelector(data.root),
            rootMargin: data.rootMargin || '0px',
            threshold : data.threshold  || 1.0
        }),*/

        observer = new IntersectionObserver(me.callback.bind(me)),

        targets = document.querySelectorAll(data.observe);

        observer.rootId = data.id; // hack

        targets.forEach(target => {
            observer.observe(target)
        });

        console.log(observer);
    }
}

Neo.setupClass(NeoIntersectionObserver);

export default NeoIntersectionObserver;
