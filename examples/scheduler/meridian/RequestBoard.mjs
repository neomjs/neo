import Board           from '../../../src/board/Container.mjs';
import RequestCard     from './RequestCard.mjs';
import RequestSortZone from './RequestSortZone.mjs';

/**
 * @summary Meridian's crew clearances. A crew move can clear ARC-17; booking it requires an admitted telescope slot.
 * @class Neo.examples.scheduler.meridian.RequestBoard
 * @extends Neo.board.Container
 */
class RequestBoard extends Board {
    static config = {
        /** @member {String} className @protected */
        className: 'Neo.examples.scheduler.meridian.RequestBoard',
        /** @member {String} ariaLabel */
        ariaLabel: 'Crew clearance',
        /** @member {Object[]} cardItems */
        cardItems: [{type: 'title'}, {type: 'tags'}],
        /** @member {Function} cardModule Fixed programme cards share one comparison with the desk controls. */
        cardModule: RequestCard,
        /** @member {String[]} cls */
        cls: ['meridian-board'],
        /** @member {Object[]} columns */
        columns: [
            {status: 'queue', title: 'Queue'}, {status: 'cleared', title: 'Cleared'}, {status: 'booked', title: 'Booked'}
        ],
        /** @member {Boolean} columnsResortable */
        columnsResortable: false,
        /** @member {Object|null} planningController The desk that owns this night's plan. */
        planningController: null,
        /** @member {Object} sortZoneConfig */
        sortZoneConfig: {module: RequestSortZone}
    }

    /** @summary Enter or the ARC-17 card action opens the same comparison as the desk's Compare slots button.
     * @param {Object|String} cardOrRecord
     * @returns {null}
     */
    openCardEditor(cardOrRecord) {
        const record = cardOrRecord?.record ?? (typeof cardOrRecord === 'object' ? cardOrRecord : this.store?.get(cardOrRecord));
        if (record?.id === 'arc17' && this.store?.get('arc17') === record) this.planningController?.compare();
        return null
    }

    /** @summary Admits ordinary Board moves only for the active request and only to a meaningful clearance.
     * @param {Object} move Native board move.
     * @returns {Object|null} The moved record, or null for a refusal.
     */
    moveCard(move) {
        const record = move.record ?? (move.key != null ? this.getSourceRecord(move.key) : Neo.getComponent(move.cardId)?.record);
        if (record?.id !== 'arc17') return null;
        if (move.status === 'booked' && !this.planningController?.hasBooking) {
            this.planningController?.notice('Drop ARC-17 on a telescope to book it.');
            return null
        }
        return super.moveCard(move)
    }
}

export default Neo.setupClass(RequestBoard);
