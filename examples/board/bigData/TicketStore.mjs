import CardModel from '../../../src/board/CardModel.mjs';
import Store     from '../../../src/data/Store.mjs';

const
    // How many tickets each status holds on load, in column order: 10,000 in all
    statusCounts = {new: 6200, triage: 1500, waiting: 1100, solved: 800, closed: 400},
    agents       = ['Avery', 'Blake', 'Casey', 'Devon', 'Emery', 'Finley', 'Harper', 'Jules'],
    customers    = ['A customer', 'An admin', 'A new user', 'A reseller', 'A team lead', 'The finance team'],
    // Each area's issues, so a ticket's area tag always matches its title
    issues       = {
        billing : ['is charged twice for the March invoice', 'sees the wrong total on an invoice',
                   'gets no receipt for the annual plan', 'cannot redeem a gift card'],
        login   : ['cannot finish two-factor sign-in', 'is asked twice for a sign-in code',
                   'never gets the password reset email', 'is signed out every few minutes'],
        mobile  : ['sees the iOS app crash on launch', 'loses a draft in the Android app',
                   'cannot pay in the mobile checkout'],
        export  : ['times out on the CSV download', 'misses rows in the PDF export', 'gets an empty scheduled export'],
        search  : ['finds nothing with a quoted phrase', 'loses a saved search', 'sees stale search results'],
        shipping: ['cannot print a return label', 'sees the wrong delivery date', 'gets no shipping confirmation'],
        api     : ['gets a 500 from the webhook settings', 'hits the rate limit too early', 'cannot rotate an API key'],
        reports : ['sees the wrong total in the usage dashboard', 'cannot open a shared report',
                   'gets the weekly digest twice']
    },
    areas        = Object.keys(issues);

/**
 * @summary A support desk's 10,000 tickets in five statuses, generated from one seed: the same desk on every load.
 * @description Ticket `t-1` tops New with the highest ticket number: New holds the newest tickets, and Closed the
 * oldest. A title is the ticket's number, then a customer with one of an area's issues, so a problem that recurs still
 * reads as separate tickets. The area is a tag, and so is the priority when it is high or urgent. One agent is the assignee, except in New, where nobody has picked
 * the ticket up yet. `order` stays unset: the board numbers each column when it loads.
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
            records = [],
            total   = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

        for (const [status, count] of Object.entries(statusCounts)) {
            for (let i = 0; i < count; i++) {
                const
                    priority = next() < .12 ? 'urgent' : next() < .4 ? 'high' : 'normal',
                    area     = pick(areas);

                records.push({
                    id       : `t-${records.length + 1}`,
                    title    : `#${total - records.length} · ${pick(customers)} ${pick(issues[area])}`,
                    status,
                    tags     : priority === 'normal' ? [area] : [area, priority],
                    assignees: status === 'new' ? [] : [pick(agents)],
                    color    : priority === 'urgent' ? '#e5484d' : null
                })
            }
        }

        return records
    }
}

export default Neo.setupClass(TicketStore);
