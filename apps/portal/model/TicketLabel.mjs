import Model from '../../../src/data/Model.mjs';

/**
 * @class Portal.model.TicketLabel
 * @extends Neo.data.Model
 */
class TicketLabel extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.TicketLabel'
         * @protected
         */
        className: 'Portal.model.TicketLabel',
        /**
         * @member {Object[]} fields
         * @protected
         */
        fields: [{
            name: 'color',
            type: 'String'
        }, {
            name: 'description',
            type: 'String'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'textColor',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(TicketLabel);
