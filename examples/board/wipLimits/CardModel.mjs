import BoardCardModel from '../../../src/board/CardModel.mjs';

/**
 * @summary Repair ticket model for the workshop WIP-limits board.
 * @description Extends {@link Neo.board.CardModel} with `ticketNote` (customer and fault summary rendered beneath the
 * card title via the board's `text` card-item renderer).
 * @class Neo.examples.board.wipLimits.CardModel
 * @extends Neo.board.CardModel
 */
class CardModel extends BoardCardModel {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.wipLimits.CardModel'
         * @protected
         */
        className: 'Neo.examples.board.wipLimits.CardModel',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'ticketNote',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(CardModel);
