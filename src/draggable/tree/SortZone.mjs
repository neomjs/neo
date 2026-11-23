import DragZone from './DragZone.mjs';
import NeoArray from '../../util/Array.mjs';

/**
 * @summary Moves a tree list's records by drag and drop: between two items, or into a folder.
 *
 * The main thread hit-tests every `drag:move` (`Neo.main.draggable.sensor.Pointer`) and sends the path under the
 * pointer as `targetPath`, so this zone reads its slot from the item under the pointer. The upper or lower half of a
 * leaf puts the record before or after it. A folder's top quarter is the gap before it, the bottom quarter of a
 * closed folder the gap after it, and the rest takes the record in as the folder's last child. The slot shows on
 * that item as a line or an outline, and the tree keeps its order until the drop.
 *
 * A drop writes the record's `parentId` and its place in the store, and the tree renders from the store: among
 * siblings, store order is tree order. A folder never moves into itself or one of its descendants.
 *
 * `Neo.tree.List#dragResortable` creates this zone.
 * @class Neo.draggable.tree.SortZone
 * @extends Neo.draggable.tree.DragZone
 */
class SortZone extends DragZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.tree.SortZone'
         * @protected
         */
        className: 'Neo.draggable.tree.SortZone',
        /**
         * @member {String} ntype='tree-sortzone'
         * @protected
         */
        ntype: 'tree-sortzone',
        /**
         * The proxy may pass the tree's edge: it hangs beside the pointer, and the main thread clamps by the item's
         * full width, which would push a label-sized proxy back over the items
         * @member {Boolean} allowOverdrag=true
         */
        allowOverdrag: true,
        /**
         * Every move reaches the App Worker, carrying the main thread's hit test
         * @member {Boolean} alwaysFireDragMove=true
         */
        alwaysFireDragMove: true,
        /**
         * The proxy shrinks to the item's label
         * @member {Object|null} dragProxyConfig
         */
        dragProxyConfig: {
            cls: ['neo-tree-list', 'neo-tree-sort-proxy']
        }
    }

    /**
     * The record the running drag moves
     * @member {Object|null} #source=null
     */
    #source = null
    /**
     * Where a drop would place the source: `{position, target}`, with `position` `'before'`, `'after'` or `'inside'`
     * @member {Object|null} #slot=null
     */
    #slot = null

    /**
     * Reads where the pointer would drop the source from the main thread's hit test.
     * @param {Object}   data
     * @param {Number}   data.clientY
     * @param {Object[]} [data.targetPath=[]] The nodes under the pointer, innermost first, each with its `rect`
     * @returns {Object|null|undefined} `{position, target}`; `null` outside the tree and over the source or its
     * descendants, where nothing can drop; `undefined` over anything that is no item, which keeps the slot
     */
    getSlot({clientY, targetPath=[]}) {
        let me      = this,
            {owner} = me,
            source  = me.#source,
            node, offset, target;

        if (!targetPath.some(item => item.id === owner.id)) {
            return null
        }

        node   = targetPath.find(item => item.cls?.includes(owner.itemCls) && item.id?.startsWith(owner.id + '__'));
        target = node && me.#getRecord(node.id);

        if (!target) {
            return undefined
        }

        if (source && (target === source || me.isAncestor(source, target))) {
            return null
        }

        offset = (clientY - node.rect.top) / node.rect.height;

        if (target.isLeaf) {
            return {position: offset < .5 ? 'before' : 'after', target}
        }

        if (offset < .25) {
            return {position: 'before', target}
        }

        return {position: offset > .75 && target.collapsed ? 'after' : 'inside', target}
    }

    /**
     * True if `record` sits inside `ancestor`, at any depth
     * @param {Object} ancestor
     * @param {Object} record
     * @returns {Boolean}
     */
    isAncestor(ancestor, record) {
        let {owner}  = this,
            key      = ancestor[owner.getKeyProperty()],
            parentId = record.parentId;

        while (parentId !== null && parentId !== undefined) {
            if (parentId === key) {
                return true
            }

            parentId = owner.store.get(parentId)?.parentId
        }

        return false
    }

    /**
     * The proxy hangs below and to the right of the pointer instead of at the point it was grabbed, clear of the item
     * the pointer is over, so that item's label and its slot stay in view
     * @returns {Object}
     * @protected
     */
    getMainThreadConfigs() {
        return {...super.getMainThreadConfigs(), offsetX: -16, offsetY: -26}
    }

    /**
     * A sort zone runs while its tree is `dragResortable`, which excludes `draggable`
     * @returns {Boolean}
     * @protected
     */
    isDragEnabled() {
        return this.owner.dragResortable
    }

    /**
     * Moves a record before or after another item, or into a folder as its last child. The record takes its new
     * parent's id as `parentId` and its new place in the store, and the tree renders again. Pointer drops commit
     * here.
     * @param {Object} record
     * @param {Object} target
     * @param {String} position `'before'`, `'after'` or `'inside'`, which needs a folder
     * @returns {Boolean} true if the tree changed
     * @fires move
     */
    moveRecord(record, target, position) {
        let me          = this,
            {owner}     = me,
            {store}     = owner,
            inside      = position === 'inside',
            oldParentId = record.parentId,
            parentId    = inside ? target[owner.getKeyProperty()] : target.parentId,
            from, items, to;

        if (record === target || me.isAncestor(record, target) || (inside && target.isLeaf)) {
            return false
        }

        items = store.items.filter(item => item !== record);
        from  = store.items.indexOf(record);
        to    = inside ? items.length : items.indexOf(target) + (position === 'after' ? 1 : 0);

        if (from === to && parentId === oldParentId) {
            return false
        }

        store.move(from, to);

        if (record.isRecord) {
            record.setSilent({parentId})
        } else {
            record.parentId = parentId
        }

        owner.createItems();

        /**
         * The move event fires after a drop moved a record
         * @event move
         * @param {Number|String|null} oldParentId
         * @param {Number|String|null} parentId
         * @param {String}             position `'before'`, `'after'` or `'inside'`
         * @param {Object}             record
         * @param {Object}             target
         */
        me.fire('move', {oldParentId, parentId, position, record, target});

        return true
    }

    /**
     * Escape leaves the tree as it was: a cancelled drag wrote nothing.
     * @param {Object} data
     */
    onDragCancel(data) {
        let me = this;

        if (me.#source) {
            me.#unmark(me.#source, me.#slot);
            me.#source = me.#slot = null
        }

        super.onDragCancel(data)
    }

    /**
     * Commits the slot, then lands the proxy: on the source's new place, on the closed folder that took it in, or
     * back on its start when nothing moved.
     * @param {Object} data
     */
    async onDragEnd(data) {
        let me      = this,
            {owner} = me,
            source  = me.#source,
            slot    = me.#slot,
            rect;

        // One release arrives twice: through the owner's delegated DOM listener and through manager.DomEvent
        if (!source) {
            return
        }

        me.#source = me.#slot = null;

        if (slot && me.moveRecord(source, slot.target, slot.position)) {
            await owner.promiseUpdate();

            rect = await owner.getDomRect(me.#itemId(source));

            // A closed folder renders no children, so its own item is where the record went
            if (!(rect?.width > 0)) {
                rect = await owner.getDomRect(me.#itemId(slot.target))
            }

            me.dragElementRect = rect
        } else {
            me.#unmark(source, slot)
        }

        super.onDragEnd(data)
    }

    /**
     * @param {Object} data The `drag:move` data, with the main thread's `targetPath`
     */
    onDragMove(data) {
        let me = this,
            current, slot;

        if (me.#source) {
            current = me.#slot;
            slot    = me.getSlot(data);

            if (slot !== undefined && (slot?.target !== current?.target || slot?.position !== current?.position)) {
                current && me.#setItemCls(current.target, `neo-drop-${current.position}`, false);
                slot    && me.#setItemCls(slot.target,    `neo-drop-${slot.position}`,    true);

                me.#slot = slot;
                me.owner.update()
            }
        }
    }

    /**
     * Starts a move drag on an item the zone marks as draggable.
     * @param {Object} data
     */
    async onDragStart(data) {
        let me     = this,
            record = me.isDragEnabled() && me.#getRecord(data.path[0].id);

        if (record && me.isItemDraggable(record)) {
            me.#source = record;
            me.#slot   = null;

            await super.onDragStart(data);

            // The proxy is a copy of the item as it was, so the source dims after it exists
            if (me.#source) {
                me.#setItemCls(record, 'neo-sort-source', true);
                me.owner.update()
            }
        }
    }

    /**
     * Resolves an item's vnode id to its record. A tree renders item ids from record keys, and a collection keyed by
     * numbers holds them as numbers, while the id carries a string.
     * @param {String} itemId
     * @returns {Object|null}
     */
    #getRecord(itemId) {
        let {owner} = this,
            {store} = owner,
            key     = owner.getItemRecordId(itemId);

        return store.get(key) || store.get(store.getCanonicalKey(key))
    }

    /**
     * @param {Object} record
     * @returns {String} The id of the record's item node
     */
    #itemId(record) {
        let {owner} = this;

        return owner.getItemId(record[owner.getKeyProperty()])
    }

    /**
     * Adds or removes a class on a record's item node
     * @param {Object}  record
     * @param {String}  cls
     * @param {Boolean} add
     */
    #setItemCls(record, cls, add) {
        let node = this.owner.getVdomChild(this.#itemId(record));

        node && NeoArray[add ? 'add' : 'remove'](node.cls = node.cls || [], cls)
    }

    /**
     * Removes the drag's marks: the dimmed source and the slot
     * @param {Object}      source
     * @param {Object|null} slot
     */
    #unmark(source, slot) {
        let me = this;

        me.#setItemCls(source, 'neo-sort-source', false);
        slot && me.#setItemCls(slot.target, `neo-drop-${slot.position}`, false);

        me.owner.update()
    }
}

export default Neo.setupClass(SortZone);
