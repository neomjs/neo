import Base from '../core/Base.mjs';

/**
 * @summary Maps the logical scroll range of a fixed-height grid view onto the physical range a browser lays out.
 *
 * A browser caps the extent of a scroll container however its content is split: about 33.5M px in Blink and
 * WebKit, 17.9M px in Gecko, which drops taller content to nothing instead of clamping it. A grid whose rows reach
 * past the cap keeps its whole logical range here, split into pages over the physical one:
 *
 * - **Inside a page** the physical offset is the logical one minus the page's offset. Scrolling stays 1:1, so the
 *   compositor moves the rows by the right distance.
 * - **Crossing into another page** keeps the logical offset and moves the physical one by the difference of the two
 *   page offsets. {@link Neo.grid.View} moves the rows and the scroll offset in one update, as a scroll correction.
 * - **The scrollbar's thumb** picks its page in proportion to where it is, so a drag reaches every row.
 *
 * The physical range holds 100 pages, and the logical range as many pages of the same height as fit. A page's offset
 * grows by {@link #pageStep} from one page to the next, so the last page ends where the physical range ends. SlickGrid
 * splits its virtual pages the same way.
 *
 * Below the cap there is one page, at offset 0: the logical and the physical offsets are the same.
 * @class Neo.grid.ScrollPages
 * @extends Neo.core.Base
 */
class ScrollPages extends Base {
    static config = {
        /**
         * @member {String} className='Neo.grid.ScrollPages'
         * @protected
         */
        className: 'Neo.grid.ScrollPages',
        /**
         * The logical extent in px: every row, plus the scroll room below the last one
         * @member {Number} extent=0
         */
        extent: 0,
        /**
         * The largest extent in px the physical range takes, see {@link Neo.grid.View#maxScrollHeight}
         * @member {Number} maxExtent=Infinity
         */
        maxExtent: Infinity,
        /**
         * The height of the viewport in px
         * @member {Number} viewHeight=0
         */
        viewHeight: 0
    }

    /**
     * The number of pages: 1 below the cap
     * @member {Number} pageCount
     */
    get pageCount() {
        return this.paged ? Math.floor(this.extent / this.pageHeight) : 1
    }

    /**
     * True while the logical extent exceeds {@link #maxExtent}
     * @member {Boolean} paged
     */
    get paged() {
        return this.extent > this.maxExtent
    }

    /**
     * The height of a page in px: a hundredth of the physical range
     * @member {Number} pageHeight
     */
    get pageHeight() {
        return this.physicalExtent / 100
    }

    /**
     * The distance in px between the offsets of two neighbouring pages
     * @member {Number} pageStep
     */
    get pageStep() {
        let {pageCount} = this;
        return pageCount > 1 ? (this.extent - this.maxExtent) / (pageCount - 1) : 0
    }

    /**
     * The extent of the physical range in px
     * @member {Number} physicalExtent
     */
    get physicalExtent() {
        return Math.min(this.extent, this.maxExtent)
    }

    /**
     * The logical offset in px where the physical range starts while a page is the current one
     * @param {Number} page
     * @returns {Number}
     */
    offsetAt(page) {
        return Math.round(page * this.pageStep)
    }

    /**
     * The page a logical offset lies on. A page's offset grows by less than a page, so near the end of a long range
     * the rows of a page reach past the physical range: their offsets go to the next page. A page before the last also
     * keeps its offsets below the end of the physical range, where the browser stops a scroll.
     * @param {Number} scrollTop The logical offset in px
     * @returns {Number}
     */
    pageAt(scrollTop) {
        let me = this;

        if (!me.paged) {
            return 0
        }

        let last  = me.pageCount - 1,
            limit = me.physicalExtent - me.viewHeight,
            page  = Math.max(0, Math.min(last, Math.floor(scrollTop / me.pageHeight)));

        while (page < last && scrollTop - me.offsetAt(page) >= limit) {
            page++
        }

        return page
    }

    /**
     * The page for a physical offset the scrollbar's thumb sets: the page of the logical offset at the same share of
     * the logical range. The thumb's top picks the first page and its bottom the last one.
     * @param {Number} physical The physical offset in px
     * @returns {Number}
     */
    thumbPageAt(physical) {
        let {extent, physicalExtent, viewHeight} = this,
            range                                = physicalExtent - viewHeight;

        return range > 0 ? this.pageAt(physical * (extent - viewHeight) / range) : 0
    }
}

export default Neo.setupClass(ScrollPages);
