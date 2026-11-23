import BoardCardModel from '../../../src/board/CardModel.mjs';

/**
 * @summary A card of the team board: a board card plus the team whose swimlane it sits in.
 * @description The board reads `team` through its `laneField`. A card without a team has `team: null` and sits in
 * the board's "Unassigned" row.
 * @class Neo.examples.board.swimlanes.CardModel
 * @extends Neo.board.CardModel
 */
class CardModel extends BoardCardModel {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.swimlanes.CardModel'
         * @protected
         */
        className: 'Neo.examples.board.swimlanes.CardModel',
        /**
         * Merged with the board card's fields
         * @member {Object[]} fields
         */
        fields: [{
            name: 'team'
        }]
    }
}

export default Neo.setupClass(CardModel);
