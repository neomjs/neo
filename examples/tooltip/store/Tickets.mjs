import Store  from '../../../src/data/Store.mjs';
import Ticket from '../model/Ticket.mjs';

/**
 * @summary The tickets of the sprint the board shows.
 * @class Neo.examples.tooltip.store.Tickets
 * @extends Neo.data.Store
 */
class Tickets extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.tooltip.store.Tickets'
         * @protected
         */
        className: 'Neo.examples.tooltip.store.Tickets',
        /**
         * @member {Neo.data.Model} model=Ticket
         */
        model: Ticket,
        /**
         * @member {Object[]} data
         */
        data: [
            {assignee: 'Maya Chen',  id: 'NEO-141', points: 3, status: 'In review',   title: 'Keyboard focus shows a tooltip'},
            {assignee: 'Jonas Berg', id: 'NEO-142', points: 2, status: 'Done',        title: 'Escape closes a tooltip'},
            {assignee: 'Ana Ruiz',   id: 'NEO-143', points: 5, status: 'In progress', title: 'Tooltip delays in the settings'},
            {assignee: 'Sam Okafor', id: 'NEO-144', points: 3, status: 'To do',       title: 'A velocity card on the toolbar'},
            {assignee: 'Maya Chen',  id: 'NEO-145', points: 1, status: 'Done',        title: 'Hints on every toolbar button'},
            {assignee: 'Ana Ruiz',   id: 'NEO-146', points: 2, status: 'To do',       title: 'A tap shows the hint on a phone'}
        ]
    }
}

export default Neo.setupClass(Tickets);
