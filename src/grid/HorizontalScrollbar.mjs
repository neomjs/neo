import Base from '../component/Base.mjs';

/**
 * @class Neo.grid.HorizontalScrollbar
 * @extends Neo.component.Base
 */
class HorizontalScrollbar extends Base {
    static config = {
        /**
         * @member {String} className='Neo.grid.HorizontalScrollbar'
         * @protected
         */
        className: 'Neo.grid.HorizontalScrollbar',
        /**
         * @member {String} ntype='grid-horizontal-scrollbar'
         * @protected
         */
        ntype: 'grid-horizontal-scrollbar',
        /**
         * The exact width in pixels of the center columns (the scrollable content).
         * @member {Number} centerWidth_=0
         */
        centerWidth_: 0,
        /**
         * @member {String[]} cls=['neo-grid-horizontal-scrollbar']
         */
        cls: ['neo-grid-horizontal-scrollbar'],
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['neo-grid-horizontal-scrollbar-content'], style: {height: '1px'}}
        ]}
    }

    /**
     * Triggered after the centerWidth config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetCenterWidth(value, oldValue) {
        if (value || value === 0) {
            this.vdom.cn[0].style.width = `${value}px`;
            this.update();
        }
    }
}

export default Neo.setupClass(HorizontalScrollbar);
