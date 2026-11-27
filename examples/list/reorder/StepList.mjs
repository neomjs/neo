import List     from '../../../src/list/Base.mjs';
import SortZone from '../../../src/draggable/list/SortZone.mjs';

/**
 * @summary The release checklist: one row per step, its place first. A row moves by drag, or by keyboard.
 *
 * The place is the row's index in the rendered list, which follows the store's sort, so the numbers change only
 * once a drop or a key has written the new order into the store. Both commit through `SortZone.moveRecord()`.
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
        },
        /**
         * Ctrl+Shift (Cmd+Shift on macOS) with Up or Down moves the focused step one place
         * @member {Object} keys
         */
        keys: {
            Down: 'onKeyDownNext',
            Up  : 'onKeyDownPrevious'
        },
        /**
         * The reference of the polite live region, a sibling in the same panel, that announces a keyboard move
         * @member {String} statusReference='stepStatus'
         */
        statusReference: 'stepStatus'
    }

    /**
     * Ctrl or Cmd with an arrow key is the reorder of {@link #keys}, so the main thread's navigator leaves it to the
     * App Worker and moves the focus only on a plain arrow
     * @member {Object} navigator
     * @protected
     */
    navigator = {workerChords: true}

    /**
     * @summary Writes a message into the panel's live region, so a screen reader reads it once.
     * @param {String} message
     */
    announce(message) {
        let status = this.parent?.getReference(this.statusReference);

        if (status) {
            status.text = message
        }
    }

    /**
     * @param {Object} record
     * @param {Number} index
     * @param {Number} [poolIndex=index]
     * @returns {Object}
     */
    createItem(record, index, poolIndex=index) {
        let item = super.createItem(record, index, poolIndex);

        if (item) {
            item['aria-keyshortcuts'] = 'Control+Shift+ArrowUp Control+Shift+ArrowDown Meta+Shift+ArrowUp Meta+Shift+ArrowDown'
        }

        return item
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

    /**
     * @param {Object[]} path An event path
     * @returns {Neo.data.Record|null} The step of the first item on the path
     */
    getStepRecord(path) {
        let me   = this,
            item = path.find(node => node.cls?.includes(me.itemCls));

        return item ? me.store.get(me.getItemRecordId(item.id)) : null
    }

    /**
     * Moves the focused step one place, through the same commit as a drop, keeps the focus on it and announces its new
     * place. At either end the order and the focus stay as they are. While a pointer drag holds its proxy, the drag
     * owns the order: a move then would change the store under it, and Escape could no longer restore it.
     * @param {Object} data The keydown data
     * @param {Number} step -1 moves up, 1 down
     * @protected
     */
    async moveFocusedStep(data, step) {
        let me     = this,
            record = (data.ctrlKey || data.metaKey) && data.shiftKey && me.getStepRecord(data.path),
            items, target;

        if (record && !me.dragZone?.dragProxy) {
            items  = me.store.items;
            target = items[items.indexOf(record) + step];

            if (target && me.dragZone?.moveRecord(record, target, step < 0)) {
                await me.promiseUpdate();
                items = me.store.items;
                me.focus(me.getItemId(record));
                me.announce(`${record.text}, step ${items.indexOf(record) + 1} of ${items.length}`)
            } else if (!target) {
                me.announce(`${record.text} is already ${step < 0 ? 'the first' : 'the last'} step`)
            }
        }
    }

    /**
     * Down: with Ctrl+Shift (Cmd+Shift on macOS), moves the focused step one place down
     * @param {Object} data
     * @returns {Promise<void>}
     */
    onKeyDownNext(data) {
        return this.moveFocusedStep(data, 1)
    }

    /**
     * Up: with Ctrl+Shift (Cmd+Shift on macOS), moves the focused step one place up
     * @param {Object} data
     * @returns {Promise<void>}
     */
    onKeyDownPrevious(data) {
        return this.moveFocusedStep(data, -1)
    }
}

export default Neo.setupClass(StepList);
