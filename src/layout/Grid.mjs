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
        ntype: 'layout-grid'
    }

    /**
     * Applies CSS classes to the container this layout is bound to
     */
    applyRenderAttributes() {
        let me         = this,
            container  = Neo.getComponent(me.containerId),
            wrapperCls = container?.wrapperCls || [];

        if (!container) {
            Neo.logError('layout.Grid: applyRenderAttributes -> container not yet created', me.containerId)
        }

        NeoArray.add(wrapperCls, 'neo-layout-grid');

        container.wrapperCls = wrapperCls
    }
}

Neo.setupClass(Grid);

export default Grid;
