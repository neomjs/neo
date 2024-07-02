import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.layout.Cube
 * @extends Neo.layout.Base
 */
class Cube extends Base {
    /**
     * @member {String[]} faces=['front','back','left','right','top','bottom']
     * @static
     */
    static faces = ['front', 'back', 'left', 'right', 'top', 'bottom']

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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me        = this,
            container = Neo.getComponent(me.containerId),
            {vdom}    = container,
            {cn}      = vdom;

        vdom.cn = [
            {cls: ['neo-plane'], cn: [
                {cls: ['neo-box'], cn}
            ]}
        ];

        // override
        container.getVdomItemsRoot = function() {
            return this.vdom.cn[0].cn[0]
        }
    }

    /**
     * Initially sets the CSS classes of the container items this layout is bound to.
     * @param {Neo.component.Base} item
     * @param {Number} index
     */
    applyChildAttributes(item, index) {
        let {wrapperCls} = item;

        wrapperCls = NeoArray.union(wrapperCls, 'neo-face', Cube.faces[index]);

        switch(index) {
            case 0:
            case 1:
                wrapperCls = NeoArray.union(wrapperCls, 'neo-face-z');
                break;
            case 2:
            case 3:
                wrapperCls = NeoArray.union(wrapperCls, 'neo-face-x');
                break;
            case 4:
            case 5:
                wrapperCls = NeoArray.union(wrapperCls, 'neo-face-y');
                break;
        }

        item.wrapperCls = wrapperCls
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
