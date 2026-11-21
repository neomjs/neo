import BoardCardModel from '../../../src/board/CardModel.mjs';

/**
 * @summary Design studio commission card model for the column-arrangement board example.
 * @description Extends {@link Neo.board.CardModel} with `commissionSummary` (client and deliverable note rendered
 * beneath the commission title through the board's `text` card-item renderer).
 * @class Neo.examples.board.columns.CommissionModel
 * @extends Neo.board.CardModel
 */
class CommissionModel extends BoardCardModel {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.columns.CommissionModel'
         * @protected
         */
        className: 'Neo.examples.board.columns.CommissionModel',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'commissionSummary',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(CommissionModel);
