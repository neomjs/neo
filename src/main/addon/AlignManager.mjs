import Base      from '../../core/Base.mjs';
import DomEvents from '../DomEvents.mjs'

/**
 * This addon keeps the position of absolutely positioned elements aligned to a target element
 * according to a passed align rule object.
 * @class Neo.main.addon.AlignManager
 * @extends Neo.core.Base
 * @singleton
 */
class AlignManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.AlignManager'
         * @protected
         */
        className: 'Neo.main.addon.AlignManager',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'onShow',
                'onHide',
                'showRect'
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

        this.realignItem = this.realignItem.bind(this);
        document.addEventListener('scroll', this.realignAll.bind(this), true)
    }

    showRect(rect) {
        const div = document.createElement('div');

        div.style = `
            position:absolute;
            transform:translate3d(${rect.x}px, ${rect.y}px, 0);
            height:${rect.height}px;
            width:${rect.width}px;
            background-color:${rect.color}
        `;
    }

    /**
     */
    realignAll() {
        this.sourceMap.forEach(this.realignItem);
    }

    realignItem({ source, target, align }) {
        const
            sourceEl = document.getElementById(sourceId),
            targetRect = (target instanceof DOMRect) ? targetRect : document.getElementById(target).getBoundingClientRect(),
            alignSpec = me.processAlignSpec(align)

    }

    /**
     * @param {Object} item
     * @param {String} item.sourceId
     * @param {String} item.targetId
     * @returns Promise<Boolean>
     */
    async onShow(item) {
        this.sourceMap[item.sourceId] = item;
        this.realignItem(item);
        return true;
    }

    /**
     * @param {Object} data
     * @param {String} data.sourceId
     * @param {String} data.targetId
     * @returns {Boolean}
     */
    onHide(item) {
        delete sourceMap[item.sourceId];
        return true;
    }
}

let instance = Neo.applyClassConfig(AlignManager);

export default instance;
