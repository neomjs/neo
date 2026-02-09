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
        return id && this.view.store.get(id) || null
    }
}

export default Neo.setupClass(BaseModel);
