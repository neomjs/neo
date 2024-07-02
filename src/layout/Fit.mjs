import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.layout.Fit
 * @extends Neo.layout.Base
 */
class Fit extends Base {
    static config = {
        /**
         * @member {String} className='Neo.layout.Fit'
         * @protected
         */
        className: 'Neo.layout.Fit',
        /**
         * @member {String} ntype='layout-fit'
         * @protected
         */
        ntype: 'layout-fit',
        /**
         * @member {String|null} containerCls='neo-layout-fit'
         * @protected
         */
        containerCls: 'neo-layout-fit'
    }

    /**
     * Initially sets the CSS classes of the container items this layout is bound to.
     * @param {Neo.component.Base} item
     * @param {Number} index
     */
    applyChildAttributes(item, index) {
        if (!item.ignoreLayout) {
            item.wrapperCls = NeoArray.union(item.wrapperCls, 'neo-layout-fit-item')
        }
    }

    /**
     * Removes all CSS rules from a container item this layout is bound to.
     * Gets called when switching to a different layout.
     * @param {Neo.component.Base} item
     */
    removeChildAttributes(item) {
        if (!item.ignoreLayout) {
            let {wrapperCls} = item;

            NeoArray.remove(wrapperCls, 'neo-layout-fit-item');
            item.wrapperCls = wrapperCls
        }
    }
}

Neo.setupClass(Fit);

export default Fit;
