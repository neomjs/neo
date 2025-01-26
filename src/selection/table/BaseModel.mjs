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
}

export default Neo.setupClass(BaseModel);
