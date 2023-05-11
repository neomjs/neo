import Base      from '../../core/Base.mjs';
import DomEvents from '../DomEvents.mjs'

/**
 * @class Neo.main.addon.ScrollSync
 * @extends Neo.core.Base
 * @singleton
 */
class ScrollSync extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.ScrollSync'
         * @protected
         */
        className: 'Neo.main.addon.ScrollSync',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'register',
                'unregister'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Object} sourceMap={}
     * @protected
     */
    sourceMap = {}

    /**
     * @param {Object} config
     */
    construct(config = {}) {
        super.construct(config);

        document.addEventListener('scroll', this.onDocumentScroll.bind(this), true)
    }

    /**
     * @param {Event} event
     */
    onDocumentScroll(event) {
        let path = event.composedPath().map(e => DomEvents.getTargetData(e));

        console.log('onDocumentScroll', path);
    }

    /**
     * @param {Object} data
     * @param {String} data.sourceId
     * @param {String} data.targetId
     * @returns {Boolean}
     */
    register(data) {
        let sourceId  = data.sourceId,
            sourceMap = this.sourceMap,
            targetId  = data.targetId;

        if (!sourceMap[sourceId]) {
            sourceMap[sourceId] = {}
        }

        sourceMap[sourceId][targetId] = {}

        return true
    }

    /**
     * @param {Object} data
     * @param {String} data.sourceId
     * @param {String} data.targetId
     * @returns {Boolean}
     */
    unregister(data) {
        let hasMatch  = false,
            sourceId  = data.sourceId,
            sourceMap = this.sourceMap,
            targetId  = data.targetId;

        if (sourceMap[sourceId]) {
            if (sourceMap[sourceId][targetId]) {
                delete sourceMap[sourceId][targetId];
                hasMatch = true
            }

            if (Object.keys(sourceMap[sourceId]).length < 1) {
                delete sourceMap[sourceId]
            }
        }

        return hasMatch
    }
}

Neo.applyClassConfig(ScrollSync);

let instance = Neo.create(ScrollSync);

Neo.applyToGlobalNs(instance);

export default instance;
