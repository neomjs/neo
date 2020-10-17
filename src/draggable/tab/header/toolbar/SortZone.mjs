import BaseSortZone from '../../../toolbar/SortZone.mjs';

/**
 * @class Neo.draggable.tab.header.toolbar.SortZone
 * @extends Neo.draggable.toolbar.SortZone
 */
class SortZone extends BaseSortZone {
    static getConfig() {return {
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
            cls: ['neo-dragproxy', 'neo-tab-header-toolbar', 'neo-toolbar']
        }
    }}

    /**
     * Override this method for class extensions (e.g. tab.header.Toolbar)
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    moveTo(fromIndex, toIndex) {
        this.owner.up().moveTo(fromIndex, toIndex);
    }
}

Neo.applyClassConfig(SortZone);

export {SortZone as default};