import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.layout.Grid
 * @extends Neo.layout.Base
 */
class Grid extends Base {
    static config = {
        /**
         * @member {String} className='Neo.layout.Grid'
         * @protected
         */
        className: 'Neo.layout.Grid',
        /**
         * @member {String} ntype='layout-hbox'
         * @protected
         */
        ntype: 'layout-grid',
        /**
         * @member {String|null} containerCls='neo-layout-fit'
         * @protected
         * @reactive
         */
        containerCls: 'neo-layout-grid'
    }
}

export default Neo.setupClass(Grid);
