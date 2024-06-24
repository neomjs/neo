import Base      from './Base.mjs';
import DomEvents from '../DomEvents.mjs';

/**
 * Creating IntersectionObservers to get infos about DOM node visibility.
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
                'disconnect',
                'observe',
                'register'
            ]
        }
    }

    /**
     * Storing data from observe() calls which arrived prior to register()
     * @member {Object} map={}
     * @protected
     */
    cache = {}
    /**
     * Storing component ids and their IntersectionObservers
     * @member {Object} map={}
     * @protected
     */
    map = {}

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    disconnect(data) {
        this.map[data.id]?.disconnect()
    }

    /**
     * @param {IntersectionObserverEntry[]} entries
     * @param {IntersectionObserver} observer
     */
    findTopmostItem(entries, observer) {
        let me = this,
            data, path, rect, target;

        entries.forEach(entry => {
            target = entry.target;
            data   = target.dataset && {...target.dataset} || null;
            path   = DomEvents.getPathFromElement(entry.target).map(e => DomEvents.getTargetData(e));
            rect   = target.getBoundingClientRect();

            // 200 is just a random number to ignore intersection changes at the bottom of the view
            if (rect.y < 200) {
                // scroll in from top => direct match
                if (entry.isIntersecting) {
                    me.sendMessage({data, id: observer.rootId, isIntersecting: true, path, targetId: target.id})
                } else {
                    // scroll out from top
                    // not perfect since the node is already outside the view
                    me.sendMessage({data, id: observer.rootId, isIntersecting: true, path, targetId: target.id})
                }
            }
        })
    }

    /**
     * @param {IntersectionObserverEntry[]} entries
     * @param {IntersectionObserver} observer
     */
    isVisible(entries, observer) {
        let me = this,
            data, path, target;

        entries.forEach(entry => {
            target = entry.target;
            data   = target.dataset && {...target.dataset} || null;
            path   = DomEvents.getPathFromElement(entry.target).map(e => DomEvents.getTargetData(e));

            if (entry.isIntersecting) {
                me.sendMessage({data, id: observer.rootId, isIntersecting: true, path, targetId: target.id})
            }
        })
    }

    /**
     * Add more or new items into an existing observer instance
     * @param {Object} data
     * @param {Boolean} [data.disconnect=false] true removes all currently observed targets
     * @param {String} data.id
     * @param {String|String[]} data.observe The querySelector to match elements
     * @returns {Boolean} true in case the targets got observed, false in case they got cached prior to a register() call
     */
    observe(data) {
        let me            = this,
            cache         = me.cache,
            {id, observe} = data,
            observer      = me.map[data.id],
            targets       = [];

        if (!Neo.isArray(observe)) {
            observe = [observe]
        }

        observe.forEach(item => {
            targets.push(...document.querySelectorAll(item))
        })

        if (observer) {
            data.disconnect && observer.disconnect();

            targets.forEach(target => {
                observer.observe(target)
            })
        } else {
            if (!cache[id]) {
                cache[id] = []
            }

            cache[id].push(data);
        }

        return !!observer
    }

    /**
     * @param {Object} data
     * @param {String} data.callback
     * @param {String} data.id
     * @param {String|String[]} [data.observe] The querySelector to match elements
     * @param {String} data.root
     * @param {String} data.rootMargin='0px'
     * @param {Number|Number[]} data.threshold=0.0
     */
    register(data) {
        let me            = this,
            {cache}       = me,
            {id, observe} = data,
            observer;

        me.map[id] = observer = new IntersectionObserver(me[data.callback].bind(me), {
            root      : document.querySelector(data.root),
            rootMargin: data.rootMargin || '0px',
            threshold : data.threshold  || 0.0
        });

        observer.rootId = data.id; // storing the component id

        observe && me.observe({id, observe});

        if (cache[id]) {
            cache[id].forEach(item => me.observe(item));
            delete cache[id]
        }
    }

    /**
     * @param {Object} data
     */
    sendMessage(data) {
        Neo.worker.Manager.sendMessage('app', {
            action   : 'domEvent',
            eventName: 'intersect',
            data
        })
    }
}

Neo.setupClass(NeoIntersectionObserver);

export default NeoIntersectionObserver;
