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

    /**
     * @param {Object} item
     * @param {Boolean} [silent] true to prevent a vdom update
     * @param {Object[]|String[]} itemCollection=this.items
     * @param {String} [selectedCls]
     */
    deselect(item, silent, itemCollection=this.items, selectedCls) {
        let {view} = this;

        if (!silent) {
            view.updateDepth = 2
        }

        super.deselect(item, silent, itemCollection, selectedCls)
    }

    /**
     * @param {Boolean} [silent] true to prevent a vdom update
     */
    deselectAll(silent) {
        let {view} = this;

        if (!silent) {
            view.updateDepth = 2
        }

        super.deselectAll(silent)
    }

    /**
     * @param {Object} args
     */
    select(...args) {
        let {view} = this;

        if (!view.silentSelect) {
            view.updateDepth = 2
        }

        super.select(...args)
    }
}

export default Neo.setupClass(BaseModel);
