import CardModel from '../../../src/board/CardModel.mjs';

/**
 * @summary A bug report on the triage board: a board card that knows its severity and the product area it hits.
 * @description Extends {@link Neo.board.CardModel} with `severity` (`S1` critical to `S4` trivial) and `area`. The
 * card shows both as tags, and the severity also paints the card's accent.
 * @class Neo.examples.board.multiSelect.ReportModel
 * @extends Neo.board.CardModel
 */
class ReportModel extends CardModel {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.multiSelect.ReportModel'
         * @protected
         */
        className: 'Neo.examples.board.multiSelect.ReportModel',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'area',
            type: 'String'
        }, {
            name: 'severity',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(ReportModel);
