import DragZone from './DragZone.mjs';
import NeoArray from '../../util/Array.mjs';

/**
 * @summary Reorders a store-bound list's records by drag and drop, in any layout.
 *
 * The main thread hit-tests every `drag:move` (`Neo.main.draggable.sensor.Pointer`) and sends the path under the
 * pointer as `targetPath`, so this zone reads its slot from there and measures no layout itself: rows, columns and
 * wrapped grids sort alike. During the drag only the owner's vdom changes. The siblings' item nodes take the order a
 * drop would write, and the dragged item keeps its slot as a placeholder. A drop writes that order into
 * {@link #sortField} with one {@link Neo.data.Store#updateRows} batch, and the list renders the store's sort, so the
 * store stays the only source of truth.
 *
 * The store needs a sorter on `sortField` with `reapplyOnRecordChange: true`. A record sorts among its siblings, the
 * records with its `parentId`.
 * @class Neo.draggable.list.SortZone
 * @extends Neo.draggable.list.DragZone
 */
class SortZone extends DragZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.list.SortZone'
         * @protected
         */
        className: 'Neo.draggable.list.SortZone',
        /**
         * @member {String} ntype='list-sortzone'
         * @protected
         */
        ntype: 'list-sortzone',
        /**
         * Every move reaches the App Worker, carrying the main thread's hit test
         * @member {Boolean} alwaysFireDragMove=true
         */
        alwaysFireDragMove: true,
        /**
         * Reject gaps, headers, and other groups, and recheck the hit at release. A source placeholder retains the
         * slot it previews. Lists that accept the last preview inside the list keep the default.
         * @member {Boolean} requireDropTarget=false
         */
        requireDropTarget: false,
        /**
         * The axis whose halves put the dragged record before or after an item: `'horizontal'` for rows and
         * row-major grids, `'vertical'` for columns
         * @member {String} sortDirection='vertical'
         */
        sortDirection: 'vertical',
        /**
         * The record field a move renumbers from 0 across the moved record's siblings
         * @member {String} sortField='order'
         */
        sortField: 'order'
    }

    /**
     * The record the running drag moves
     * @member {Neo.data.Record|null} #source=null
     */
    #source = null
    /**
     * Where a drop would place the source: `{before, target}`, or `null` for its own place
     * @member {Object|null} #slot=null
     */
    #slot = null

    /**
     * Returns the siblings of a record, the records that share its `parentId`, ordered by {@link #sortField}.
     * A tree store answers from its Structural Layer, so the siblings its filters hide are included.
     * @param {Neo.data.Record} record
     * @returns {Neo.data.Record[]}
     */
    getSiblings(record) {
        let {sortField} = this,
            {store}     = this.owner,
            records     = store.getChildren ? store.getChildren(record.parentId || 'root') : [...(store.allItems || store).items];

        return records.sort((a, b) => a[sortField] - b[sortField])
    }

    /**
     * Reads where the pointer would drop the source from the main thread's hit test.
     * @param {Object}   data
     * @param {Number}   data.clientX
     * @param {Number}   data.clientY
     * @param {Object[]} [data.targetPath=[]] The nodes under the pointer, innermost first, each with its `rect`
     * @returns {Object|null|undefined} `{before, target}`; `null` for a rejected hit; `undefined` on the source
     * placeholder. By default gaps, headers and other parents' items also keep the last preview (`undefined`).
     */
    getSlot({clientX, clientY, targetPath=[]}) {
        let me      = this,
            {owner} = me,
            source  = me.#source,
            node, rect, target;

        if (!targetPath.some(item => item.id === owner.id)) {
            return null
        }

        node   = targetPath.find(item => item.cls?.includes(owner.itemCls) && item.id?.startsWith(owner.id + '__'));
        target = node && owner.store.get(owner.getItemRecordId(node.id));

        if (target === source) {
            return undefined
        }

        if (!target || target.isHeader || target.parentId !== source.parentId) {
            return me.requireDropTarget ? null : undefined
        }

        rect = node.rect;

        return {
            before: me.sortDirection === 'horizontal' ? clientX < rect.left + rect.width / 2 : clientY < rect.top + rect.height / 2,
            target
        }
    }

    /**
     * Moves a record before or after one of its siblings. {@link #sortField} is renumbered from 0 across every
     * sibling, filtered-out ones included, so a hidden sibling keeps its place relative to the others. One
     * {@link Neo.data.Store#updateRows} batch writes the changed values, and the store's sorter orders the list.
     * Pointer drops and keyboard paths both commit here.
     * @param {Neo.data.Record} record
     * @param {Neo.data.Record} target A sibling of `record`
     * @param {Boolean}         before True places `record` before `target`, false after it
     * @returns {Boolean} true if the order changed
     * @fires sort
     */
    moveRecord(record, target, before) {
        let me          = this,
            {sortField} = me,
            {store}     = me.owner,
            records     = me.#place(me.getSiblings(record), record, target, before),
            changes     = [];

        records.forEach((item, index) => {
            item[sortField] !== index && changes.push({key: store.getKey(item), values: {[sortField]: index}})
        });

        if (changes.length) {
            store.updateRows(changes);
            me.fire('sort', {before, changes, record, records, target})
        }

        return changes.length > 0
    }

    /**
     * Escape renders the store's order back: a cancelled drag wrote nothing.
     * @param {Object} data
     */
    onDragCancel(data) {
        let me = this;

        if (me.#source) {
            me.#source = me.#slot = null;
            me.owner.createItems()
        }

        super.onDragCancel(data)
    }

    /**
     * Commits the slot, or renders the store's order back when there is none, then lands the proxy: on the
     * source's new place, or back on its start. Strict drops recheck the terminal hit. A slot whose source or target
     * the list no longer shows commits nothing.
     * @param {Object} data
     */
    async onDragEnd(data) {
        let me      = this,
            {owner} = me,
            {store} = owner,
            source  = me.#source,
            slot;

        // One release arrives twice: through the owner's delegated DOM listener and through manager.DomEvent
        if (!source) {
            return
        }

        slot = me.requireDropTarget ? me.getSlot(data) : undefined;
        if (slot === undefined) {
            slot = me.#slot
        }

        me.#source = me.#slot = null;

        if (slot && store.indexOf(source) > -1 && store.indexOf(slot.target) > -1 && me.moveRecord(source, slot.target, slot.before)) {
            await owner.promiseUpdate();
            me.dragElementRect = await owner.getDomRect(owner.getItemId(source))
        } else {
            owner.createItems()
        }

        super.onDragEnd(data)
    }

    /**
     * Shows the current slot. Strict drops also mark a rejected hit on the proxy for host styling.
     * @param {Object} data The `drag:move` data, with the main thread's `targetPath`
     */
    onDragMove(data) {
        let me = this,
            slot;

        if (me.#source) {
            slot = me.getSlot(data);

            if (me.requireDropTarget && me.dragProxy) {
                const proxy = me.dragProxy, cls = 'neo-sort-drop-rejected', rejected = slot === null;

                if (rejected !== proxy.cls.includes(cls)) {
                    rejected ? proxy.addCls(cls) : proxy.removeCls(cls)
                }
            }

            if (slot !== undefined && (slot?.target !== me.#slot?.target || slot?.before !== me.#slot?.before)) {
                me.#slot = slot;
                me.preview()
            }
        }
    }

    /**
     * Starts a sort drag on an item that is no header.
     * @param {Object} data
     */
    async onDragStart(data) {
        let me      = this,
            {owner} = me,
            record  = owner.store.get(owner.getItemRecordId(data.path[0].id));

        if (me.isDragEnabled() && record && !record.isHeader) {
            me.#source = record;
            me.#slot   = null;

            await super.onDragStart(data);

            // The proxy is a copy of the item as it was, so the placeholder starts after it exists
            me.#source && me.preview()
        }
    }

    /**
     * Places `record` before or after `target` inside `records`.
     * @param {Neo.data.Record[]} records
     * @param {Neo.data.Record}   record
     * @param {Neo.data.Record}   target
     * @param {Boolean}           before
     * @returns {Neo.data.Record[]} A new array, or `records` itself if either record is no member
     */
    #place(records, record, target, before) {
        let result = records.filter(item => item !== record),
            index  = result.indexOf(target);

        if (index < 0 || result.length === records.length) {
            return records
        }

        result.splice(before ? index : index + 1, 0, record);

        return result
    }

    /**
     * Shows the slot. The visible siblings' item nodes take the order a drop would write, and the source's node
     * is the placeholder. A strict drop marks the slot only if the source moves in the visible order. Only the
     * owner's vdom changes, the store keeps its order.
     * @protected
     */
    preview() {
        let me          = this,
            {owner}     = me,
            source      = me.#source,
            slot        = me.#slot,
            cn          = owner.getVdomRoot().cn,
            indexes     = new Map(cn.map((node, index) => [node.id, index])),
            siblings    = owner.store.items.filter(item => item.parentId === source.parentId && !item.isHeader && indexes.has(owner.getItemId(item))),
            nodes       = new Map(siblings.map(item => [item, cn[indexes.get(owner.getItemId(item))]])),
            positions   = [...nodes.values()].map(node => indexes.get(node.id)).sort((a, b) => a - b),
            ordered     = slot ? me.#place(siblings, source, slot.target, slot.before) : siblings,
            placeholder = nodes.get(source);

        if (placeholder) {
            ordered.forEach((item, index) => {
                cn[positions[index]] = nodes.get(item)
            });

            NeoArray.add(placeholder.cls = placeholder.cls || [], 'neo-sort-source');

            if (me.requireDropTarget) {
                const moved = ordered.indexOf(source) !== siblings.indexOf(source);

                NeoArray[moved ? 'add' : 'remove'](placeholder.cls, 'neo-sort-placement')
            }

            owner.update()
        }
    }
}

export default Neo.setupClass(SortZone);
