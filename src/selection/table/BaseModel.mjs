import Model from '../Model.mjs';

/**
 * Abstract base class for all table related selection models
 * @class Neo.selection.table.BaseModel
 * @extends Neo.selection.Model
 * @abstract
 */
class BaseModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.table.BaseModel'
         * @protected
         */
        className: 'Neo.selection.table.BaseModel'
    }

    /**
     * Convenience shortcut
     * @member {String[]} dataFields
     */
    get dataFields() {
        return this.view.parent.columns.map(column => column.dataField)
    }

    /**
     * Resolves a record from an ID (PK or internalId).
     * @param {String|Number} id
     * @returns {Neo.data.Record|null}
     */
    getRowRecord(id) {
        if (!id) return null;

        let me    = this,
            {view} = me,
            {store}= view,
            record = store.get(id);

        if (record) return record;

        // Table Body creates rows directly in vdom, not as components in items (mostly).
        // But getRecordByRowId might help if we have the row ID.
        // For internalId we need to check store.

        if (view.useInternalId) {
            record = store.items.find(r => store.getInternalId(r) === id);
            if (record) return record
        }

        return null
    }
}

export default Neo.setupClass(BaseModel);
