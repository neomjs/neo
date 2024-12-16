import Base from '../../core/Base.mjs';

/**
 * @class Neo.table.plugin.CellEditing
 * @extends Neo.core.Base
 */
class CellEditing extends Base {
    static config = {
        /**
         * @member {String} className='Neo.table.plugin.CellEditing'
         * @protected
         */
        className: 'Neo.table.plugin.CellEditing'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        console.log('Neo.table.plugin.CellEditing', this.id);
    }
}

export default Neo.setupClass(CellEditing);
