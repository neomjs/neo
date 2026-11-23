import CardModel from '../../../src/board/CardModel.mjs';

export const currency = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});

/**
 * @summary A pipeline card with a numeric amount and readable value and owner lines.
 * @class Neo.examples.board.salesPipeline.DealModel
 * @extends Neo.board.CardModel
 */
class DealModel extends CardModel {
    static config = {
        className: 'Neo.examples.board.salesPipeline.DealModel',
        fields   : [{name: 'amount', type: 'Float'}, {
            name: 'owner', type: 'String'
        }, {
            name: 'dealAmountText', depends: ['amount'], calculate: data => currency.format(data.amount)
        }, {
            name: 'ownerText', depends: ['owner'], calculate: data => `Owner: ${data.owner}`
        }]
    }
}

export default Neo.setupClass(DealModel);
