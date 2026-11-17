import CardModel from '../../../src/board/CardModel.mjs';
import Store     from '../../../src/data/Store.mjs';

const
    assignees = ['Avery', 'Blake', 'Casey', 'Devon', 'Emery', 'Finley'],
    subjects  = ['the login form', 'the search box', 'the export dialog', 'the settings page', 'the onboarding tour'],
    tags      = ['frontend', 'backend', 'ux', 'docs', 'qa'],
    verbs     = ['Design', 'Build', 'Review', 'Test', 'Document', 'Ship', 'Refine', 'Measure'];

/**
 * @summary The basic board's 40 cards, the same set on every load.
 *
 * Every field derives from the record's index, so a witness can name its card before the page opens. On load,
 * `in-progress` holds 6 cards against its WIP limit of 5, and `review` 2 against its 3. `order` is left unset: the
 * board numbers each column when it loads.
 * @class Neo.examples.board.basic.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    /**
     * How many of the cards each status holds on load, in column order
     * @member {Object} statusCounts
     * @static
     */
    static statusCounts = {backlog: 12, ready: 10, 'in-progress': 6, review: 2, done: 10}

    static config = {
        /**
         * @member {String} className='Neo.examples.board.basic.MainStore'
         * @protected
         */
        className: 'Neo.examples.board.basic.MainStore',
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
     * @summary Seeds the cards once, unless records were passed in.
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
     * @summary Builds the 40 cards, each field a function of its index.
     * @description The statuses are dealt out of one list holding each status `statusCounts` times; the stride 3 is
     * coprime to 40, so `index * 3 % 40` visits every slot once and the statuses interleave. A title pairs a verb
     * (cycling every 8) with a subject (stepping every 8), so the 40 titles are distinct.
     * @returns {Object[]}
     */
    generateData() {
        const
            slots   = Object.entries(MainStore.statusCounts).flatMap(([status, count]) => Array(count).fill(status)),
            total   = slots.length,
            records = new Array(total);

        for (let index = 0; index < total; index++) {
            const
                status = slots[index * 3 % total],
                done   = status === 'done',
                active = status === 'in-progress' || status === 'review';

            records[index] = {
                id       : index + 1,
                title    : `${verbs[index % verbs.length]} ${subjects[Math.floor(index / verbs.length) % subjects.length]}`,
                status,
                tags     : index % 4 === 0 ? [tags[index % tags.length], tags[(index + 2) % tags.length]] : [tags[index % tags.length]],
                assignees: status === 'backlog' ? [] : [assignees[index % assignees.length]],
                progress : done ? 100 : active ? 20 + index * 17 % 70 : undefined,
                color    : index % 7 === 0 ? '#e5484d' : index % 7 === 3 ? '#f5a524' : null
            }
        }

        return records
    }
}

export default Neo.setupClass(MainStore);
