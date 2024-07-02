import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

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

    /**
     * Applies CSS classes to the container this layout is bound to
     */
    applyRenderAttributes() {
        let me         = this,
            container  = Neo.getComponent(me.containerId),
            wrapperCls = container?.wrapperCls || [];

        if (!container) {
            Neo.logError('layout.Cube: applyRenderAttributes -> container not yet created', me.containerId)
        }

        NeoArray.add(wrapperCls, 'neo-layout-cube');

        container.wrapperCls = wrapperCls
    }
}

Neo.setupClass(Cube);

export default Cube;
