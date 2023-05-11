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
        let me        = this,
            path      = event.composedPath().map(e => DomEvents.getTargetData(e)),
            i         = 0,
            len       = path.length,
            sourceMap = me.sourceMap,
            node, nodeId;
//console.log(path)
        for (; i < len; i++) {
            node   = path[i];
            nodeId = node.id;

            if (!nodeId) {
                break;
            }

            if (sourceMap[nodeId]) {console.log(sourceMap[nodeId], sourceMap);
                Object.entries(sourceMap[nodeId]).forEach(([key, value]) => {
                    console.log('scroll', key)
                })
            }
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.sourceId
     * @param {String} data.targetId
     * @returns Promise<Boolean>
     */
    async register(data) {
        // short delay to ensure the target node got mounted
        await Neo.timeout(50)

        let sourceId   = data.sourceId,
            sourceMap  = this.sourceMap,
            sourceNode = document.getElementById(sourceId),
            sourceRect = sourceNode.getBoundingClientRect(),
            parentNode = sourceNode.parentNode,
            targetId   = data.targetId,
            targetRect = document.getElementById(targetId).getBoundingClientRect(),
            deltaX     = targetRect.left - sourceRect.left,
            deltaY     = targetRect.top  - sourceRect.top,
            overflowX, overflowY, parentId;

        while (parentNode && parentNode.id) {
            parentId = parentNode.id;

            ({overflowX, overflowY} = getComputedStyle(parentNode))

            if (overflowX === 'auto' || overflowX === 'scroll' || overflowY === 'auto' || overflowY === 'scroll') {
                if (!sourceMap[parentId]) {
                    sourceMap[parentId] = []
                }

                sourceMap[parentId].push({deltaX, deltaY, sourceId, targetId})
            }

            parentNode = parentNode.parentNode
        }

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
