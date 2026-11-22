import List from '../../../src/list/Base.mjs';

const shortDate = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'});

/**
 * @summary A keyboard-accessible directory of the people and anniversaries in the calendar.
 * @class Neo.examples.calendar.birthdays.BirthdayRoster
 * @extends Neo.list.Base
 */
class BirthdayRoster extends List {
    static config = {
        className       : 'Neo.examples.calendar.birthdays.BirthdayRoster',
        autoDestroyStore: false,
        cls             : ['birthday-roster'],
        disableSelection: true,
        itemsFocusable  : false
    }

    /**
     * @summary Each name is a native button. Dates are formatted as calendar dates independent of the browser zone.
     * @param {Neo.data.Record} record The shared occasion.
     * @returns {Object[]}
     */
    createItemContent(record) {
        const {id, name, month, day, kind} = record;
        const date                         = month ? shortDate.format(Date.UTC(2000, month - 1, day)) : 'Date open';
        return [{
            tag: 'button', type: 'button', cls: ['birthday-person'], data: {kind, person: id},
            cn : [
                {tag: 'span', cls: ['birthday-initial'], 'aria-hidden': 'true', text: name[0]},
                {tag: 'span', cls: ['birthday-person-name'], text: name},
                {tag: 'span', cls: ['birthday-person-date'], text: date}
            ]
        }]
    }
}

export default Neo.setupClass(BirthdayRoster);
