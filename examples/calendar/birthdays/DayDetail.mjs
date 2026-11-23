import Component  from '../../../src/component/Base.mjs';
import {occursOn} from './occasions.mjs';

const
    dateHeading = new Intl.DateTimeFormat('en-US', {month: 'long', day: 'numeric', timeZone: 'UTC'}),
    weekdayYear = new Intl.DateTimeFormat('en-US', {weekday: 'long', timeZone: 'UTC'});

/**
 * @summary Shows every occasion on the selected day, or the provenance of a teammate whose date is still open.
 * @class Neo.examples.calendar.birthdays.DayDetail
 * @extends Neo.component.Base
 */
class DayDetail extends Component {
    static config = {
        className: 'Neo.examples.calendar.birthdays.DayDetail',
        cls      : ['birthday-detail'],
        /** @member {Neo.data.Store|null} occasionStore The roster owned by the viewport's state provider. */
        occasionStore: null,
        /** @member {String|null} selection_ ISO calendar date or the id of an undated occasion. */
        selection_: null,
        _vdom     : {tag: 'section', tabIndex: -1, 'aria-label': 'Occasions', 'aria-live': 'polite', cn: []}
    }

    /**
     * @summary Renders a linked note with occasion-specific wording and the anniversary in the displayed year.
     * @param {Neo.data.Record} record
     * @param {Number} year
     * @returns {Object}
     */
    createNote(record, year) {
        const {id, kind, name, source, story, since} = record;
        let label, link;
        if (kind === 'anniversary') {
            const years = year - since;
            label = years ? `GA anniversary · ${years} ${years === 1 ? 'year' : 'years'}` : 'GA release';
            link = 'Read the announcement'
        } else if (kind === 'person') {
            label = 'Founder’s birthday';
            link  = 'About this calendar'
        } else {
            label = since ? `Naming day · ${since}` : 'Original date unconfirmed';
            link  = 'Read the naming record'
        }
        return {
            tag: 'article', cls: ['birthday-note'], data: {kind, person: id},
            cn : [
                {tag: 'span', cls: ['birthday-initial'], 'aria-hidden': 'true', text: name[0]},
                {cls: ['birthday-note-copy'], cn: [
                    {tag: 'span', cls: ['birthday-note-kind'], text: label},
                    {tag: 'h3', text: name}, {tag: 'p', text: story},
                    {tag: 'a', href: source, target: '_blank', rel: 'noopener noreferrer',
                        'aria-label': `${link} for ${name} (opens in a new tab)`, text: link}
                ]}
            ]
        }
    }

    /** @summary Reads the selected civil date and all matching records from the same store as the picker. */
    afterSetSelection(value) {
        const store = this.occasionStore;
        if (!value || !store) return;
        const [year, month, day] = value.split('-').map(Number), isDate = Number.isInteger(year) && !!month && !!day,
              date               = isDate && Date.UTC(year, month - 1, day),
              records            = isDate
                  ? store.items.filter(record => occursOn(record, year, month, day))
                  : [store.get(value)].filter(Boolean);
        this.vdom.cn = [
            {tag: 'p', cls: ['birthday-weekday'], text: isDate ? `${weekdayYear.format(date)} · ${year}` : 'The team'},
            {tag: 'h2', cls: ['birthday-date'], text: isDate ? dateHeading.format(date) : 'Date open'},
            {cls: ['birthday-notes'], cn: records.length
                ? records.map(record => this.createNote(record, year))
                : [{tag: 'p', cls: ['birthday-empty'], text: 'No birthdays on this day. Choose a marked date or a name below.'}]}
        ];
        this.update()
    }
}

export default Neo.setupClass(DayDetail);
