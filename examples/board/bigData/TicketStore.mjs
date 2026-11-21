import CardModel from '../../../src/board/CardModel.mjs';
import Store     from '../../../src/data/Store.mjs';

const
    // How many tickets each status holds on load, in column order: 10,000 in all
    statusCounts = {new: 6200, triage: 1500, waiting: 1100, solved: 800, closed: 400},
    agents       = ['Avery', 'Blake', 'Casey', 'Devon', 'Emery', 'Finley', 'Harper', 'Jules'],
    areas        = ['billing', 'login', 'mobile', 'export', 'search', 'shipping', 'api', 'reports'],
    problems     = ['charged twice for', 'cannot open', 'times out on', 'shows the wrong total in', 'loses changes in',
                    'asks again for a code in', 'is slow to load', 'sends no email about'],
    subjects     = ['the March invoice', 'a shared report', 'the order history', 'two-factor sign-in', 'the CSV download',
                    'a return label', 'the team workspace', 'the webhook settings', 'the saved search', 'a gift card',
                    'the mobile checkout', 'the usage dashboard'],
    customers    = ['A customer', 'An admin', 'A new user', 'A reseller', 'A team lead', 'The finance team'];

/**
 * @summary A support desk's 10,000 tickets in five statuses, generated from one seed: the same desk on every load.
 * @description Ticket `t-1` is the oldest. A title pairs a customer, a problem and a subject; the area and a priority
 * are its tags and one agent its assignee, except in New, where nobody has picked it up yet. `order` stays unset: the
 * board numbers each column when it loads.
 * @class Neo.examples.board.bigData.TicketStore
 * @extends Neo.data.Store
 */
class TicketStore extends Store {
    /**
     * How many tickets each status holds on load, in column order
     * @member {Object} statusCounts
     * @static
     */
    static statusCounts = statusCounts

    static config = {
        /**
         * @member {String} className='Neo.examples.board.bigData.TicketStore'
         * @protected
         */
        className: 'Neo.examples.board.bigData.TicketStore',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=CardModel
         */
        model: CardModel
    }

    /**
     * @summary Seeds the tickets once, unless records were passed in.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (!me.items?.length) {
            me.add(me.generateData())
        }
    }

    /**
     * @summary A seeded pseudo-random number generator (mulberry32), so every load builds the same desk.
     * @param {Number} seed
     * @returns {Function} Returns the next number in [0, 1)
     */
    createRandom(seed) {
        return () => {
            seed |= 0;
            seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296
        }
    }

    /**
     * @summary Builds the 10,000 tickets, status by status, from seed 21627.
     * @returns {Object[]}
     */
    generateData() {
        const
            next    = this.createRandom(21627),
            pick    = list => list[Math.floor(next() * list.length)],
            records = [];

        for (const [status, count] of Object.entries(statusCounts)) {
            for (let i = 0; i < count; i++) {
                const priority = next() < .12 ? 'urgent' : next() < .4 ? 'high' : 'normal';

                records.push({
                    id       : `t-${records.length + 1}`,
                    title    : `${pick(customers)} ${pick(problems)} ${pick(subjects)}`,
                    status,
                    tags     : [pick(areas), priority],
                    assignees: status === 'new' ? [] : [pick(agents)],
                    color    : priority === 'urgent' ? '#e5484d' : null
                })
            }
        }

        return records
    }
}

export default Neo.setupClass(TicketStore);
