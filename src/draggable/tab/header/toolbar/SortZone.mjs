import BaseSortZone from '../../../toolbar/SortZone.mjs';
import NeoArray     from '../../../../util/Array.mjs';

/**
 * @class Neo.draggable.tab.header.toolbar.SortZone
 * @extends Neo.draggable.toolbar.SortZone
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
     * @param {Object} data
     */
    onDragEnd(data) {
        super.onDragEnd(data);

        this.timeout(300).then(() => {
            let me      = this,
                {owner} = me,
                cls     = owner.cls || [];

            NeoArray.remove(cls, 'neo-no-animation');
            owner.cls = cls
        })
    }

    /**
     * @param {Object} data
     */
    onDragStart(data) {
        let me      = this,
            {owner} = me,
            cls     = owner.cls || [];

        NeoArray.add(cls, 'neo-no-animation');
        owner.cls = cls;

        super.onDragStart(data)
    }
}

export default Neo.setupClass(SortZone);
