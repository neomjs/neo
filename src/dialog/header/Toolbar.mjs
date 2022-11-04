import Base from '../../toolbar/Base.mjs';

/**
 * @class Neo.dialog.header.Toolbar
 * @extends Neo.toolbar.Base
 */
class Toolbar extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.dialog.header.Toolbar'
         * @protected
         */
        className: 'Neo.dialog.header.Toolbar'
    }}
}

Neo.applyClassConfig(Toolbar);

export default Toolbar;
