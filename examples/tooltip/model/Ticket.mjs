import Model from '../../../src/data/Model.mjs';

/**
 * @summary A ticket on the sprint board: what it asks for, who owns it, its points and where it stands.
 * @class Neo.examples.tooltip.model.Ticket
 * @extends Neo.data.Model
 */
class Ticket extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.tooltip.model.Ticket'
         * @protected
         */
        className: 'Neo.examples.tooltip.model.Ticket',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'assignee', type: 'String'},
            {name: 'id',       type: 'String'},
            {name: 'points',   type: 'Integer'},
            {name: 'status',   type: 'String'},
            {name: 'title',    type: 'String'}
        ]
    }
}

export default Neo.setupClass(Ticket);
