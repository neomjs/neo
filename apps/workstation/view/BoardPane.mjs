import BoardContainer                from '../../../src/board/Container.mjs';
import {cardItems, registerCardItem} from '../../../src/board/CardItems.mjs';
import {daysLabel}                   from './planningCalendar.mjs';
import SelectField                   from '../../../src/form/field/Select.mjs';

/**
 * @summary The planning arrangement's board: the team's work items as cards, one column per status.
 *
 * The workspace hands this pane the provider's `workItems` store: the instance the schedule binds as its
 * events. A card moved here is one `record.set({status, order})` on the record the schedule's bar reads, and
 * a bar moved there changes the days its card shows, in any window. The pane keeps no copy of its records.
 *
 * A card shows its work item's title, its progress, and a footer with its days and its person: the days in
 * the planning calendar's format, the person from the provider's `people` store, the rows of the schedule.
 *
 * @class Workstation.view.BoardPane
 * @extends Neo.board.Container
 */
class BoardPane extends BoardContainer {
    static config = {
        /**
         * @member {String} className='Workstation.view.BoardPane'
         * @protected
         */
        className: 'Workstation.view.BoardPane',
        /**
         * @member {String} ariaLabel='Team board'
         */
        ariaLabel: 'Team board',
        /**
         * The footer joins the title and the progress bar.
         * @member {Object[]} cardItems
         */
        cardItems: [{type: 'title'}, {type: 'progress'}, {type: 'workstation-plan'}],
        /**
         * @member {String[]} cls
         */
        cls: ['workstation-data-pane', 'workstation-board-pane'],
        /**
         * The work-item statuses in the order work moves. Each column wears the colour the schedule dresses
         * its status's bars in ({@link Workstation.view.SchedulerPane#statusBarCls}), so a column and its bars
         * read as one status.
         * @member {Object[]} columns
         */
        columns: [
            {status: 'backlog',     title: 'Backlog',     color: 'var(--workstation-ink-faint)'},
            {status: 'ready',       title: 'Ready',       color: 'var(--neo-timeline-bar-border-color)'},
            {status: 'in-progress', title: 'In progress', color: 'var(--neo-scheduler-bar-amber-border)'},
            {status: 'review',      title: 'Review',      color: 'var(--neo-scheduler-bar-violet-border)'},
            {status: 'done',        title: 'Done',        color: 'var(--neo-scheduler-bar-emerald-border)'}
        ],
        /**
         * The team, keyed as a work item's `resourceId` names its person. Borrowed, never owned.
         * @member {Neo.data.Store|null} people_=null
         * @reactive
         */
        people_: null
    }

    /**
     * @summary Names the card editor's fields for a work item, its person chosen among the team, and re-renders
     * every card when the team changes after construction. A work item's days are the schedule's to move.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetPeople(value, oldValue) {
        let me = this;

        me.cardEditorConfig = {...me.cardEditorConfig, fields: [
            'title',
            'status',
            {module: SelectField, displayField: 'name', labelText: 'Person', name: 'resourceId', store: value, valueField: 'id'},
            'progress',
            'description'
        ]};

        if (oldValue !== undefined) {
            me.cardEditor?.destroy();
            me.cardEditor = null;
            me.cardMap.forEach(card => card.renderItems())
        }
    }
}

/**
 * A card's footer: the work item's days on the left and its person's avatar on the right. The avatar is the
 * family's own item, fed the person's name.
 */
registerCardItem('workstation-plan', (record, item, card) => {
    const {endDate, resourceId, startDate} = record,
          name                             = card?.board?.people?.get(resourceId)?.name,
          avatars                          = name && cardItems.avatars({assignees: [name]}, {});

    return startDate && endDate ? {
        cls: ['workstation-card-plan'],
        cn : [{tag: 'span', cls: ['workstation-card-days'], text: daysLabel(startDate, endDate)}, avatars].filter(Boolean)
    } : null
});

export default Neo.setupClass(BoardPane);
