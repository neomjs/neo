import Board              from '../../../src/board/Container.mjs';
import {registerCardItem} from '../../../src/board/CardItems.mjs';

const days  = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}),
      years = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});

registerCardItem('planning-dates', record => {
    if (record.startDate == null || record.endDate == null) return null;
    const start = new Date(record.startDate), end = new Date(record.endDate);
    if (!Number.isFinite(+start) || !Number.isFinite(+end)) return null;
    // An exclusive midnight end belongs to the preceding occupied day.
    if (+end < +start) return null;
    if (+end > +start && +end % 86_400_000 === 0) end.setTime(+end - 1);
    const format = start.getUTCFullYear() === end.getUTCFullYear() ? days : years;
    return {cls: ['planning-card-dates'], text: `${format.formatRange(start, end)} UTC`}
});

registerCardItem('planning-person', (record, item, card) => {
    const person = card.board?.peopleStore?.get(record.resourceId);
    return {cls: ['planning-card-person'], data: {person: String(record.resourceId ?? '')}, text: person?.name || 'Unassigned'}
});

/**
 * @summary A board projection of the chart's task records, with dates and people read from their owners.
 * @class Neo.examples.dashboard.planning.Board
 * @extends Neo.board.Container
 */
class PlanningBoard extends Board {
    static config = {
        className       : 'Neo.examples.dashboard.planning.Board',
        ariaLabel       : 'Task board',
        cardEditorConfig: {fields: ['title', 'status', 'description']},
        cardItems       : [{type: 'title'}, {type: 'planning-dates'}, {type: 'planning-person'}],
        cls             : ['planning-board'],
        columns         : [
            {status: 'ready', title: 'Ready', color: 'var(--planning-ready)'},
            {status: 'active', title: 'Active', color: 'var(--planning-active)'},
            {status: 'done', title: 'Done', color: 'var(--planning-done)'}
        ],
        columnsResortable: false,
        /** @member {Neo.data.Store|null} peopleStore The shared resource records. */
        peopleStore: null
    }
}

export default Neo.setupClass(PlanningBoard);
