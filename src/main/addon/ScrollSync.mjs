import Base      from '../../core/Base.mjs';
import DomEvents from '../DomEvents.mjs'

/**
 * This addon keeps the position of overlays in sync with an anchor element,
 * when scrolling inside any parent node.
 * A prominent use case is Neo.form.field.Picker.
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
    construct(config) {
        super.construct(config);

        document.addEventListener('scroll', this.onDocumentScroll.bind(this), true)
    }

    /**
     * @param {Event} event
     */
    onDocumentScroll(event) {
        let me         = this,
            scrollNode = event.target,
            sourceRect, targetNode;

        me.sourceMap[scrollNode.id]?.forEach(item => {
            sourceRect = document.getElementById(item.sourceId).getBoundingClientRect();
            targetNode = document.getElementById(item.targetId)

            targetNode.style.left = `${sourceRect.x + item.deltaX}px`;
            targetNode.style.top  = `${sourceRect.y + item.deltaY}px`
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.sourceId
     * @param {String} data.targetId
     * @returns Promise<Boolean>
     */
    async register(data) {
        // short delay to ensure the target node got mounted
        await this.timeout(50)

        let sourceId   = data.sourceId,
            sourceMap  = this.sourceMap,
            sourceNode = document.getElementById(sourceId),
            sourceRect = sourceNode.getBoundingClientRect(),
            parentNode = sourceNode.parentNode,
            targetId   = data.targetId,
            targetRect = document.getElementById(targetId).getBoundingClientRect(),
            deltaX     = targetRect.x - sourceRect.x,
            deltaY     = targetRect.y - sourceRect.y,
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
        let sourceId   = data.sourceId,
            sourceMap  = this.sourceMap,
            sourceNode = document.getElementById(sourceId),
            parentNode = sourceNode.parentNode,
            parentId;

        while (parentNode && parentNode.id) {
            parentId = parentNode.id;

            if (sourceMap[parentId]) {
                [...sourceMap[parentId]].forEach((item, index) => {
                    if (item.sourceId === sourceId && item.targetId === data.targetId) {
                        sourceMap[parentId].splice(index, 1)
                    }
                })

                if (sourceMap[parentId].length < 1) {
                    delete sourceMap[parentId]
                }
            }

            parentNode = parentNode.parentNode
        }

        return true
    }
}

let instance = Neo.applyClassConfig(ScrollSync);

export default instance;
