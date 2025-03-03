import Base from '../../core/Base.mjs';

/**
 * @class Neo.grid.column.Base
 * @extends Neo.core.Base
 */
class Column extends Base {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.Base'
         * @protected
         */
        className: 'Neo.grid.column.Base',
        /**
         * @member {String} ntype='grid-column'
         * @protected
         */
        ntype: 'grid-column',
        /**
         * @member {String|null} dataField=null
         */
        dataField: null
    }
}

export default Neo.setupClass(Column);
