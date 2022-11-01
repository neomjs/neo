import Base from '../../container/Base.mjs';

/**
 * @class Neo.dialog.header.Toolbar
 * @extends Neo.container.Base
 */
class Toolbar extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.dialog.header.Toolbar'
         * @protected
         */
        className: 'Neo.dialog.header.Toolbar',
        /**
         * @member {Object[]} items
         */
        items: []
    }}
}

Neo.applyClassConfig(Toolbar);

export default Toolbar;
