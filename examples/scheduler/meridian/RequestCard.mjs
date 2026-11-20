import Card from '../../../src/board/Card.mjs';

/**
 * @summary One observing programme. Its name is fixed; ARC-17 opens the telescope comparison from its card.
 * @class Neo.examples.scheduler.meridian.RequestCard
 * @extends Neo.board.Card
 */
class RequestCard extends Card {
    static config = {
        /** @member {String} className @protected */
        className: 'Neo.examples.scheduler.meridian.RequestCard'
    }

    /** @summary Replaces the generic editor action with the action available for this night's active request. */
    renderItems() {
        super.renderItems();
        const items = this.vdom.cn, action = items.at(-1);
        if (!action?.cls?.includes('neo-board-card-menu-button')) return;
        if (this.record.id === 'arc17') {
            action['aria-label'] = action.title = 'Compare telescope slots';
            action.text = '⇄'
        } else {
            items.pop()
        }
        this.update()
    }

    /** @summary The fixed programme names cannot be edited. @returns {Boolean} */
    startTitleEdit() { return false }
}

export default Neo.setupClass(RequestCard);
