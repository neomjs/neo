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
        return this.view.parent.columns.map(c => c.dataField)
    }
}

export default Neo.setupClass(BaseModel);
