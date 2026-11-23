import Component      from '../../../src/component/Base.mjs';
import Container      from '../../../src/container/Base.mjs';
import DateUtil       from '../../../src/util/Date.mjs';
import StateProvider  from '../../../src/state/Provider.mjs';
import Store          from '../../../src/data/Store.mjs';
import ThemeSwitcher  from '../../../src/button/ThemeSwitcher.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';
import BirthdayPicker from './BirthdayPicker.mjs';
import BirthdayRoster from './BirthdayRoster.mjs';
import DayDetail      from './DayDetail.mjs';
import {occasions}    from './occasions.mjs';

/**
 * @summary A recurring team birthday calendar. Its picker, directory and day notes share the same occasion records.
 * @class Neo.examples.calendar.birthdays.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className    : 'Neo.examples.calendar.birthdays.MainContainer',
        cls          : ['birthday-book'],
        layout       : {ntype: 'base'},
        stateProvider: {
            module: StateProvider,
            data  : {selection: null},
            stores: {occasions: {
                module: Store, sorters: [{property: 'name'}],
                model : {fields: ['id', 'name', 'kind', 'month', 'day', 'since', 'source', 'story'].map(name => ({name}))},
                data  : occasions
            }}
        }
    }

    /** @summary Opens on the founder's birthday and Neo's GA anniversary in the current team year. */
    onConstructed() {
        super.onConstructed();
        const provider = this.getStateProvider(), store = provider.getStore('occasions');
        const year     = new Intl.DateTimeFormat('en-US', {year: 'numeric', timeZone: 'Europe/Berlin'}).format(new Date());
        const opening  = `${year}-11-23`;
        provider.setData('selection', opening);
        this.add({
            module: Container, cls: ['birthday-page'], layout: {ntype: 'base'},
            items : [{
                module: Container, cls: ['birthday-masthead'], layout: {ntype: 'base'},
                items : [{
                    module: Component, cls: ['birthday-masthead-content'], vdom: {tag: 'header', cn: [
                        {tag: 'img', cls: ['birthday-hero-art'], alt: '', src: Neo.config.resourcesPath + 'examples/birthdays/candles.jpg'},
                        {cls: ['birthday-masthead-copy'], cn: [
                            {tag: 'p', cls: ['birthday-byline'], text: 'Neo.mjs · Team calendar'},
                            {tag: 'h1', text: 'The birthday book'},
                            {tag: 'p', text: 'For our AI teammates, a birthday is the day they accepted their name.'}
                        ]}
                    ]}
                }, {module: ThemeSwitcher, cls: ['birthday-theme']}]
            }, {
                module: Container, cls: ['birthday-spread'], layout: {ntype: 'base'},
                items : [{
                    module   : BirthdayPicker, reference: 'picker', occasionStore: store, value: opening,
                    locale   : 'en-US', dayNameFormat: 'short', weekStartDay: 1, showDisabledDays: true, useAnimations: false,
                    listeners: {dateChange: ({value}) => provider.setData('selection', DateUtil.convertToyyyymmdd(value))}
                }, {
                    module: DayDetail, occasionStore: store, reference: 'detail',
                    bind  : {selection: data => data.selection}
                }]
            }, {
                module: Container, cls: ['birthday-directory'], layout: {ntype: 'base'},
                items : [{
                    module: Component, cls: ['birthday-directory-head'], vdom: {tag: 'header', cn: [
                        {tag: 'h2', text: 'People & occasions'},
                        {tag: 'p', text: 'Choose a name to open its day. Naming dates follow Berlin time.'}
                    ]}
                }, {
                    module   : BirthdayRoster, store, ariaLabel: 'People and occasions',
                    listeners: {itemClick: ({record}) => this.openOccasion(record)}
                }]
            }]
        })
    }

    /**
     * @summary Jumps to the occasion in the year being browsed, or its first year if it had not happened then.
     * @param {Neo.data.Record} record
     */
    openOccasion(record) {
        const provider = this.getStateProvider(), picker = this.getReference('picker');
        if (record.month == null || record.day == null) {
            provider.setData('selection', record.id)
        } else {
            const year = Math.max(picker.currentDate.getFullYear(), record.since || 1),
                  date = DateUtil.convertToyyyymmdd(new Date(year, record.month - 1, record.day, 12));
            picker.value = date;
            provider.setData('selection', date)
        }
        this.getReference('detail').focus()
    }
}

export default Neo.setupClass(MainContainer);
