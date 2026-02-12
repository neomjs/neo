import Toolbar from '../../toolbar/Base.mjs';

/**
 * @class Neo.grid.footer.Toolbar
 * @extends Neo.toolbar.Base
 */
class GridFooterToolbar extends Toolbar {
    static config = {
        /**
         * @member {String} className='Neo.grid.footer.Toolbar'
         * @protected
         */
        className: 'Neo.grid.footer.Toolbar',
        /**
         * @member {String} ntype='grid-footer-toolbar'
         * @protected
         */
        ntype: 'grid-footer-toolbar',
        /**
         * @member {String[]} baseCls=['neo-grid-footer-toolbar', 'neo-toolbar']
         * @protected
         */
        baseCls: ['neo-grid-footer-toolbar', 'neo-toolbar']
    }
}

export default Neo.setupClass(GridFooterToolbar);
