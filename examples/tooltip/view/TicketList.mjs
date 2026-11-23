import List from '../../../src/list/Base.mjs';

/**
 * @summary The sprint's tickets. A row names its ticket, and its tooltip says who owns it, its points and where it
 * stands, through the window's shared tooltip (`data-neo-tooltip`).
 * @class Neo.examples.tooltip.view.TicketList
 * @extends Neo.list.Base
 */
class TicketList extends List {
    static config = {
        /**
         * @member {String} className='Neo.examples.tooltip.view.TicketList'
         * @protected
         */
        className: 'Neo.examples.tooltip.view.TicketList'
    }

    /**
     * @param {Record} record
     * @returns {Object}
     */
    createItemContent(record) {
        return {
            data: {neoTooltip: `${record.assignee} · ${record.points} ${record.points === 1 ? 'point' : 'points'} · ${record.status}`},
            cn  : [
                {tag: 'span', cls: ['neo-tooltip-example-ticket-id'], text: record.id},
                {tag: 'span', cls: ['neo-tooltip-example-ticket-title'], text: record.title}
            ]
        }
    }
}

export default Neo.setupClass(TicketList);
