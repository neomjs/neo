import BaseSortZone from '../../../container/SortZone.mjs';

const animationClsOwner = Symbol('draggable.tab.header.toolbar.SortZone.animationCls');

/**
 * @class Neo.draggable.tab.header.toolbar.SortZone
 * @extends Neo.draggable.container.SortZone
 */
class SortZone extends BaseSortZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.tab.header.toolbar.SortZone'
         * @protected
         */
        className: 'Neo.draggable.tab.header.toolbar.SortZone',
        /**
         * @member {String} ntype='tab-header-toolbar-sortzone'
         * @protected
         */
        ntype: 'tab-header-toolbar-sortzone',
        /**
         * @member {Object|null} dragProxyConfig
         */
        dragProxyConfig: {
            cls: ['neo-tab-header-toolbar', 'neo-toolbar']
        }
    }

    /**
     * Override this method for class extensions (e.g. tab.header.Toolbar)
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    moveTo(fromIndex, toIndex) {
        // Optional-chained: a mid-gesture re-projection can detach or destroy the owner chain.
        this.owner?.up?.()?.moveTo(fromIndex, toIndex)
    }

    /**
     * Completes a tab header drag under the base drag-end latch.
     * @param {Object} data
     */
    async processDragEnd(data) {
        const promise = super.processDragEnd(data);

        this.timeout(300).then(() => {
            this.setOwnerClsContribution(animationClsOwner, [])
        });

        await promise
    }

    /**
     * @param {Object} data
     */
    async onDragStart(data) {
        this.setOwnerClsContribution(animationClsOwner, ['neo-no-animation']);

        await super.onDragStart(data)
    }
}

export default Neo.setupClass(SortZone);
