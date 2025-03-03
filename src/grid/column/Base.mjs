import CoreBase from '../../core/Base.mjs';

/**
 * @class Neo.grid.column.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.Base'
         * @protected
         */
        className: 'Neo.grid.column.Base'
    }
}

export default Neo.setupClass(Base);
