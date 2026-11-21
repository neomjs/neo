import Column from '../../../src/board/Column.mjs';

/**
 * @summary A board column that tells its board when the cards it has in the DOM change.
 * @description A sliced column renders a window of its records (`maxRenderedCards` plus `overscan`) and moves it as
 * its body scrolls; each projection ends in `updateSpacers()`. Collapsing hides the body, which takes its cards out
 * of the DOM without a projection. After either, this column fires `cardWindowChange` on its board, so the example's
 * counter can read how many cards the DOM holds.
 * @class Neo.examples.board.bigData.TicketColumn
 * @extends Neo.board.Column
 */
class TicketColumn extends Column {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.bigData.TicketColumn'
         * @protected
         */
        className: 'Neo.examples.board.bigData.TicketColumn'
    }

    /**
     * @summary Collapses or opens the column, then reports the cards it now has in the DOM.
     */
    applyCollapsed() {
        super.applyCollapsed();
        this.reportWindow()
    }

    /**
     * @summary Fires `cardWindowChange` on the board with the cards this column has in the DOM: none while collapsed.
     * @protected
     */
    reportWindow() {
        let me = this;

        me.board?.fire('cardWindowChange', {column: me, rendered: me.collapsed ? 0 : me.body?.items.length ?? 0})
    }

    /**
     * @summary Updates the spacers, then reports the rendered window to the board.
     */
    updateSpacers() {
        super.updateSpacers();
        this.reportWindow()
    }
}

export default Neo.setupClass(TicketColumn);
