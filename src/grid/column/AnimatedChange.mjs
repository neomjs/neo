import Column from './Base.mjs';

/**
 * @summary Marks a cell when its record's value changes, and follows the grid's store as it is set, swapped or removed.
 *
 * The mark is render state: the column keeps each changed record's classes for {@link #markDuration}, and every
 * render of its cell inside that window carries them through {@link #getCellStateCls}. A repaint that rebuilds the row,
 * like a store batch's or a forced view pass, therefore keeps the mark instead of dropping a patched class.
 *
 * The column renders nothing itself. It hears a change ahead of the grid bodies, so the body's repaint of the changed
 * row, or a store batch's one repaint, renders the mark.
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
     * The live marks by store key: their classes and when they end. Each mark is inserted last, so the map holds
     * them in the order they end.
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
        // Ahead of the bodies' own store listeners: a body repainting the changed row renders the mark
        value   ?.on({...listeners, order: 'before'});

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
     * @summary The body that renders this column's cells: a locked column's cells live in the grid's `bodyStart` or
     * `bodyEnd`, the others in its center `body`.
     * @returns {Neo.grid.Body|null}
     */
    getBody() {
        let {locked, parent} = this;

        return (locked === 'start' ? parent.bodyStart : locked === 'end' ? parent.bodyEnd : parent.body) || null
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
     * @returns {Object|null} {cls, until}, null without a live mark
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
     * @summary A record's cell in this column as its row last rendered it, the state the next render replaces. The
     * body's row pool is small, so an identity scan is cheaper than asking a large store for the record's index.
     * @param {Neo.data.Record} record
     * @returns {Object|null} The cell's vdom, null while no mounted row renders this column's cell of the record
     * @protected
     */
    getRenderedCell(record) {
        let {dataField} = this,
            row         = this.getBody()?.items.find(item => item.record === record);

        return row?.vdom.cn.find(node => node.data?.field === dataField) || null
    }

    /**
     * @summary Marks a changed record's cell for {@link #markDuration}. When the cell as last rendered carries the same
     * classes, a live mark or an ended one that no render took off yet, the new mark adds `neo-animated-alt`, whose
     * keyframes restart the animation. A cell carrying both gets the plain classes again.
     * @param {Neo.data.Record} record
     * @protected
     */
    mark(record) {
        let me    = this,
            marks = me.#marks,
            key   = me.store.getKey(record),
            now   = Date.now(),
            cls   = [me.getAnimationCls(record)],
            node  = me.getRenderedCell(record),
            entry;

        node?.cls.includes(cls[0]) && !node.cls.includes('neo-animated-alt') && cls.push('neo-animated-alt');

        // Inserted last, so the ended marks lead the map, and each one is visited once when it leaves
        marks.delete(key);
        marks.set(key, {cls, until: now + me.markDuration});

        for (entry of marks) {
            if (entry[1].until > now) break;
            marks.delete(entry[0])
        }
    }

    /**
     * @summary Marks the changed record's cell when the change reached this column's field.
     * @param {Object}         data
     * @param {Object[]}       data.fields Each field object contains the keys: name, oldValue, value
     * @param {Neo.data.Model} data.model The model instance of the changed record
     * @param {Object}         data.record
     */
    onRecordChange({fields, record}) {
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
                me.mark(record);
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
