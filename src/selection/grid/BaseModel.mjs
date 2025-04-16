import Model from '../Model.mjs';

/**
 * Abstract base class for all grid related selection models
 * @class Neo.selection.grid.BaseModel
 * @extends Neo.selection.Model
 * @abstract
 */
class BaseModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.grid.BaseModel'
         * @protected
         */
        className: 'Neo.selection.grid.BaseModel'
    }

    /**
     * Convenience shortcut
     * @member {String[]} dataFields
     */
    get dataFields() {
        return this.view.parent.columns.items.map(column => column.dataField)
    }

    /**
     * Get the record for a given event path
     * @param {Object[]} path
     * @param {String}   nodeId
     * @returns {Number|String|null}
     */
    getRecordId(path, nodeId) {
        let node, recordId;

        for (node of path) {
            if (node.id === nodeId) {
                recordId = node.data.recordId;

                if (this.view.store.getKeyType()?.includes('int')) {
                    recordId = parseInt(recordId)
                }

                return recordId
            }
        }

        return null
    }

    /**
     * Checks if an event path contains a grid cell editor
     * @param {Object}   data
     * @param {Object[]} data.path
     * @returns {Boolean}
     */
    hasEditorFocus({path}) {
        for (const node of path) {
            if (node.cls?.includes('neo-grid-editor')) {
                return true
            }
        }

        return false
    }
}

export default Neo.setupClass(BaseModel);
