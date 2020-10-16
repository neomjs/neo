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
        ntype: 'tab-header-toolbar-sortzone'
    }}

    /**
     * Override this method for class extensions (e.g. tab.header.Toolbar)
     * @param {Number} index
     * @param {Neo.component.Base} item
     */
    moveTo(index, item) {
        this.owner.moveTo(index, item);
    }
}

Neo.applyClassConfig(SortZone);

export {SortZone as default};