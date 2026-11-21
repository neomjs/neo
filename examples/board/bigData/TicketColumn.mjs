import Column from '../../../src/board/Column.mjs';

/**
 * @summary A board column that tells its board when the window of cards it renders changes.
 * @description A sliced column renders a window of its records (`maxRenderedCards` plus `overscan`) and moves it as
 * its body scrolls; each projection ends in `updateSpacers()`. This column then fires `cardWindowChange` on its board,
 * so the example's counter can read how many cards the DOM holds.
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
     * @summary Updates the spacers, then reports the rendered window to the board.
     */
    updateSpacers() {
        super.updateSpacers();
        this.board?.fire('cardWindowChange', {column: this, rendered: this.body?.items.length ?? 0})
    }
}

export default Neo.setupClass(TicketColumn);
