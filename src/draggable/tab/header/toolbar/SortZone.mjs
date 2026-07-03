import BaseSortZone from '../../../container/SortZone.mjs';
import NeoArray     from '../../../../util/Array.mjs';

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
        this.owner.up().moveTo(fromIndex, toIndex)
    }

    /**
     * Completes a tab header drag under the base drag-end latch.
     * @param {Object} data
     */
    async processDragEnd(data) {
        const promise = super.processDragEnd(data);

        this.timeout(300).then(() => {
            let me      = this,
                {owner} = me,
                cls     = owner.cls || [];

            NeoArray.remove(cls, 'neo-no-animation');
            owner.cls = cls
        });

        await promise
    }

    /**
     * @param {Object} data
     */
    async onDragStart(data) {
        let me      = this,
            {owner} = me,
            cls     = owner.cls || [];

        NeoArray.add(cls, 'neo-no-animation');
        owner.cls = cls;

        await super.onDragStart(data)
    }
}

export default Neo.setupClass(SortZone);
