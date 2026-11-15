import Column   from './Base.mjs';
import NeoArray from '../../util/Array.mjs';
import VdomUtil from '../../util/VDom.mjs';

/**
 * @summary Marks a cell when its record's value changes, and follows the grid's store as it is set, swapped or removed.
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
        value   ?.on(listeners)
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
     * @param {Object}         data
     * @param {Object[]}       data.fields Each field object contains the keys: name, oldValue, value
     * @param {Neo.data.Model} data.model The model instance of the changed record
     * @param {Object}         data.record
     */
    async onRecordChange({fields, record}) {
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
                // Wait for the next animation frame
                await me.timeout(20);

                let {body} = me.parent,
                    row    = body.getRow(record),
                    cellId, node;

                if (row) {
                    cellId = body.getCellId(row.rowIndex, me.dataField);
                    node   = VdomUtil.find(row.vdom, cellId)?.vdom;

                    if (node) {
                        NeoArray.add(node.cls, me.getAnimationCls(record));

                        // This will trigger a 2nd row update, after grid.Body: onStoreRecordChange()
                        // It is crucial to restart the keyframe based animation
                        // => The previous update call will remove the last animationCls
                        row.update()
                    }
                }

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
            animationCls: this.animationCls
        }
    }
}

export default Neo.setupClass(AnimatedChange);
