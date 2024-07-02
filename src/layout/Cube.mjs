import Base from './Base.mjs';

/**
 * @class Neo.layout.Cube
 * @extends Neo.layout.Base
 */
class Cube extends Base {
    static config = {
        /**
         * @member {String} className='Neo.layout.Cube'
         * @protected
         */
        className: 'Neo.layout.Cube',
        /**
         * @member {String} ntype='layout-cube'
         * @protected
         */
        ntype: 'layout-cube'
    }
}

Neo.setupClass(Cube);

export default Cube;
