import Column   from './Base.mjs';
import NeoArray from '../../util/Array.mjs';
import VdomUtil from '../../util/VDom.mjs';

/**
 * @summary Marks a cell when its record's value changes, and follows the grid's store as it is set, swapped or removed.
 *
 * The mark is render state: the column keeps each changed record's classes for {@link #markDuration}, and every
 * render of its cell inside that window carries them through {@link #getCellStateCls}. A repaint that rebuilds the row,
 * like a store batch's or a forced view pass, therefore keeps the mark instead of dropping a patched class.
 * @class Neo.grid.column.AnimatedChange
 * @extends Neo.grid.column.Base
 */
class AnimatedChange extends Column {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.AnimatedChange'
         * @protected
         */
        className: 'Neo.grid.column.AnimatedChange',
        /**
         * @member {String} animationCls='neo-animated'
         */
        animationCls: 'neo-animated',
        /**
         * How long a changed cell keeps its mark through re-renders, in ms. At least the CSS animation's duration.
         * @member {Number} markDuration=1000
         */
        markDuration: 1000,
        /**
         * The store of the grid this column belongs to, the source of the `recordChange` events it animates.
         * {@link Neo.grid.Container#afterSetStore} keeps it current: null while the grid has no store.
         * @member {Neo.data.Store|null} store_=null
         * @protected
         * @reactive
         */
        store_: null,
        /**
         * @member {String} type='animatedChange'
         * @protected
         */
        type: 'animatedChange'
    }

    /**
     * The marked records by store key: their classes, the keyframes they use and when the mark ends.
     * @member {Map} #marks=new Map()
     * @private
     */
    #marks = new Map();

    /**
     * @summary Takes the store of the parent grid, which is null for a grid created without one.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.store = this.parent?.store
    }

    /**
     * @summary Listens to the new store's `recordChange` events and stops listening to the old store's.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me        = this,
            listeners = {recordChange: me.onRecordChange, scope: me};

        oldValue?.un(listeners);
        value   ?.on(listeners);

        me.#marks.clear()
    }

    /**
     * Override as needed for dynamic record-based animation classes
     * @param {Record} record
     * @returns {String}
     */
    getAnimationCls(record) {
        return this.animationCls
    }

    /**
     * @summary The classes of a cell's live mark, which `Neo.grid.Row#applyRendererOutput` adds with every render.
     * @param {Object} rendererConfig The config `Neo.grid.Row#applyRendererOutput` hands the renderer
     * @returns {String[]|null}
     */
    getCellStateCls(rendererConfig) {
        return this.getMark(rendererConfig.record)?.cls || null
    }

    /**
     * @summary The live mark of a record's cell. A mark whose window ended is dropped.
     * @param {Neo.data.Record|Object} record
     * @returns {Object|null} {alt, cls, until}, null without a live mark
     * @protected
     */
    getMark(record) {
        let key  = this.store?.getKey(record),
            mark = this.#marks.get(key);

        if (mark && mark.until <= Date.now()) {
            this.#marks.delete(key);
            return null
        }

        return mark || null
    }

    /**
     * @summary Marks a changed record's cell for {@link #markDuration}. A change inside a live mark's window toggles
     * `neo-animated-alt`, whose keyframes restart the animation.
     *
     * A batch record needs no patch: the batch's repaint renders the mark. A single edit may arrive after the body
     * repainted the row, so the rendered cell gets the new classes and the row updates.
     * @param {Neo.data.Record} record
     * @param {Boolean} [isBatch=false]
     * @protected
     */
    mark(record, isBatch=false) {
        let me    = this,
            marks = me.#marks,
            now   = Date.now(),
            prev  = me.getMark(record),
            alt   = prev ? !prev.alt : false,
            mark  = {alt, cls: [me.getAnimationCls(record)], until: now + me.markDuration},
            body, node, row;

        alt && mark.cls.push('neo-animated-alt');
        marks.set(me.store.getKey(record), mark);

        // Rows scrolled away before their mark ended would keep their entries
        if (marks.size > 256) {
            marks.forEach((value, key) => {value.until <= now && marks.delete(key)})
        }

        if (!isBatch) {
            body = me.locked === 'start' ? me.parent.bodyStart : me.locked === 'end' ? me.parent.bodyEnd : me.parent.body;
            row  = body?.getRow(record);
            node = row && VdomUtil.find(row.vdom, body.getCellId(row.rowIndex, me.dataField))?.vdom;

            if (node) {
                prev && NeoArray.remove(node.cls, prev.cls);
                NeoArray.add(node.cls, mark.cls);
                row.update()
            }
        }
    }

    /**
     * @summary Marks the changed record's cell in the body that renders this column: a locked column's cells live in
     * the grid's `bodyStart` or `bodyEnd`, the others in its center `body`.
     * @param {Object}         data
     * @param {Object[]}       data.fields Each field object contains the keys: name, oldValue, value
     * @param {Boolean}        [data.isBatch] True for a record of a store batch, whose repaint renders the mark
     * @param {Neo.data.Model} data.model The model instance of the changed record
     * @param {Object}         data.record
     */
    onRecordChange({fields, isBatch, record}) {
        let me          = this,
            {dataField} = me,
            root        = dataField.split('.')[0],
            path        = dataField.slice(root.length + 1),
            field;

        for (field of fields) {
            // A change to a nested path arrives under its root field (`metrics` for `metrics.load`) with the whole
            // object as old and new value, so a root change only counts when the value at the path moved.
            if (field.name === dataField || (path && field.name === root &&
                me.getRecordValue(field.oldValue, path) !== me.getRecordValue(field.value, path))) {
                me.mark(record, isBatch);
                break
            }
        }
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            animationCls: this.animationCls,
            markDuration: this.markDuration
        }
    }
}

export default Neo.setupClass(AnimatedChange);
