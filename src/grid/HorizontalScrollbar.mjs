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
         * The width in pixels of the locked-end (right) column region.
         *
         * Applied as `margin-right`, so the scrollbar's scrollport covers ONLY the center region.
         * The spacer ({@link #centerWidth}) models the center content, while
         * `Neo.main.addon.GridHorizontalScrollSync` copies this element's `scrollLeft` verbatim onto
         * the center header toolbar — that 1:1 mapping is only exact when scrollport equals the
         * center clip width. Without the margins, the max `scrollLeft` falls short by exactly the
         * locked-region widths, leaving the last center columns unreachable.
         * @member {Number} endWidth_=0
         */
        endWidth_: 0,
        /**
         * The width in pixels of the locked-start (left) column region.
         * Applied as `margin-left`; see {@link #endWidth} for the scrollport-scoping rationale.
         * @member {Number} startWidth_=0
         */
        startWidth_: 0,
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

    /**
     * Triggered after the endWidth config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetEndWidth(value, oldValue) {
        if (value || value === 0) {
            this.style = {...this.style, marginRight: `${value}px`}
        }
    }

    /**
     * Triggered after the startWidth config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetStartWidth(value, oldValue) {
        if (value || value === 0) {
            this.style = {...this.style, marginLeft: `${value}px`}
        }
    }
}

export default Neo.setupClass(HorizontalScrollbar);
