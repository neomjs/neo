import List     from '../../../src/list/Base.mjs';
import SortZone from '../../../src/draggable/list/SortZone.mjs';

/**
 * @summary The release checklist: one row per step, its place first. A row moves by drag.
 *
 * The place is the row's index in the rendered list, which follows the store's sort, so the numbers change only
 * once a drop has written the new order into the store.
 * @class Neo.examples.list.reorder.StepList
 * @extends Neo.list.Base
 */
class StepList extends List {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.reorder.StepList'
         * @protected
         */
        className: 'Neo.examples.list.reorder.StepList',
        /**
         * @member {String[]} baseCls=['neo-reorder-steps','neo-list']
         * @protected
         */
        baseCls: ['neo-reorder-steps', 'neo-list'],
        /**
         * A row is moved, not chosen
         * @member {Boolean} disableSelection=true
         */
        disableSelection: true,
        /**
         * @member {Boolean} draggable=true
         */
        draggable: true,
        /**
         * Rows stack, so SortZone's default vertical halves of a row decide before or after
         * @member {Object} dragZoneConfig
         */
        dragZoneConfig: {
            module         : SortZone,
            dragProxyConfig: {cls: ['neo-list', 'neo-reorder-steps']}
        }
    }

    /**
     * @param {Object} record
     * @param {Number} index
     * @returns {Object[]}
     */
    createItemContent(record, index) {
        return [
            {tag: 'span', cls: ['neo-reorder-place'], text: index + 1},
            {tag: 'span', cls: ['neo-reorder-text'],  text: record.text}
        ]
    }
}

export default Neo.setupClass(StepList);
