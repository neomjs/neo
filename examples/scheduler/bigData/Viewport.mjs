import Button        from '../../../src/button/Base.mjs';
import Component     from '../../../src/component/Base.mjs';
import EventModel    from '../../../src/timeline/model/Event.mjs';
import Label         from '../../../src/component/Label.mjs';
import Scheduler     from '../../../src/scheduler/Container.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

const
    RESOURCE_COUNT  = 300,
    WEEKS_IN_YEAR   = 52,
    MS_PER_DAY      = 86_400_000,
    AXIS_START      = '2026-01-05',
    AXIS_END        = '2027-01-05',
    AXIS_START_MS   = Date.parse(`${AXIS_START}T00:00:00Z`),
    THREE_WEEK_ZOOM = {
        majorTickStep: 1,
        majorTickUnit: 'week',
        pxPerMinute  : 0.045,
        snapMinutes  : 60,
        tickStep     : 1,
        tickUnit     : 'day'
    },
    BAR_CLS_BY_KIND = {
        delivery: 'neo-scheduler-bar-emerald',
        oncall  : 'neo-scheduler-bar-violet',
        review  : 'neo-scheduler-bar-amber'
    },
    FIRST_NAMES = [
        'Aarav', 'Amara', 'Bram', 'Camille', 'Darius', 'Elena', 'Farid', 'Freya', 'Gael', 'Hana',
        'Ibrahim', 'Ines', 'Jonas', 'Klara', 'Luka', 'Maren', 'Nadia', 'Omar', 'Priya', 'Soren'
    ],
    LAST_NAMES = [
        'Alvarez', 'Bakker', 'Chen', 'Diallo', 'Eriksson', 'Fischer', 'Gomez', 'Hassan',
        'Ito', 'Kowalski', 'Lindqvist', 'Moreau', 'Nakamura', 'Okafor', 'Patel'
    ],
    TEAMS       = ['Platform', 'Runtime', 'Design', 'Data', 'Security', 'Infra'],
    SITES       = ['Berlin', 'Zurich', 'Toronto', 'Tokyo', 'Austin', 'Stockholm'],
    KINDS       = ['delivery', 'review', 'oncall'],
    TASK_TITLES = {
        delivery: ['API gateway cutover', 'Schema rollout', 'Release train', 'Edge cache tuning'],
        oncall  : ['Primary on-call', 'Incident drill', 'Failover rehearsal', 'Region watch'],
        review  : ['Design review', 'Perf audit', 'Accessibility sweep', 'Security sign-off']
    },
    shortDateFormatter = new Intl.DateTimeFormat('en-US', {
        day     : 'numeric',
        month   : 'short',
        timeZone: 'UTC',
        year    : 'numeric'
    }),
    weekDateFormatter = new Intl.DateTimeFormat('en-US', {
        day     : 'numeric',
        month   : 'short',
        timeZone: 'UTC'
    });

/**
 * @summary Deterministic 32-bit PRNG (Mulberry32) so reloads keep identical first-frame schedules.
 * @param {Number} seed
 * @returns {Function} Next pseudo-random float in `[0, 1)`.
 */
function createSeededRandom(seed) {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/**
 * @summary Generates 300 seeded engineers and 15,600 bookings (one per week per person across 52 weeks).
 * @returns {{bookings: Object[], people: Object[]}}
 */
function buildAnnualPlanData() {
    const
        rand     = createSeededRandom(20261123),
        people   = [],
        bookings = [];

    for (let i = 0; i < RESOURCE_COUNT; i++) {
        const
            first = FIRST_NAMES[i % FIRST_NAMES.length],
            last  = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length],
            team  = TEAMS[i % TEAMS.length],
            site  = SITES[Math.floor(i / TEAMS.length) % SITES.length];

        people.push({
            id      : `r-${String(i + 1).padStart(3, '0')}`,
            name    : `${first} ${last}`,
            site,
            team,
            teamSite: `${team} · ${site}`
        })
    }

    let eventIndex = 0;

    // Week-major emission ensures initial store rows are already chronologically ordered by startDate.
    for (let week = 0; week < WEEKS_IN_YEAR; week++) {
        const weekBaseMs = AXIS_START_MS + week * 7 * MS_PER_DAY;

        for (let personIdx = 0; personIdx < RESOURCE_COUNT; personIdx++) {
            eventIndex += 1;

            const
                offsetDays   = week === 0 ? personIdx % 3 : Math.floor(rand() * 4),
                durationDays = 2 + Math.floor(rand() * 4),
                kind         = KINDS[(personIdx + week + Math.floor(rand() * 2)) % KINDS.length],
                titles       = TASK_TITLES[kind],
                startMs      = weekBaseMs + offsetDays * MS_PER_DAY,
                endMs        = startMs + durationDays * MS_PER_DAY;

            bookings.push({
                id         : `ev-${String(eventIndex).padStart(5, '0')}`,
                kind,
                percentDone: Math.floor(rand() * 101),
                resourceId : people[personIdx].id,
                startDate  : new Date(startMs).toISOString(),
                endDate    : new Date(endMs).toISOString(),
                title      : titles[Math.floor(rand() * titles.length)]
            })
        }
    }

    return {bookings, people}
}

const {bookings, people} = buildAnnualPlanData();

/**
 * @summary Renders 300 engineers and 15,600 annual bookings with row virtualization and horizontal bar windowing.
 * @class Neo.examples.scheduler.bigData.Viewport
 * @extends Neo.container.Viewport
 */
class BigDataViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.scheduler.bigData.Viewport'
         * @protected
         */
        className: 'Neo.examples.scheduler.bigData.Viewport',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['year-plan-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [
                {module: Label, cls: ['year-plan-title'], text: 'Annual engineering plan'},
                {
                    module   : Label,
                    cls      : ['year-plan-counts'],
                    reference: 'plan-counts',
                    text     : `${RESOURCE_COUNT.toLocaleString('en-US')} people · ${bookings.length.toLocaleString('en-US')} bookings`
                },
                {module: Label, cls: ['year-plan-hint'], text: `Scroll down through ${RESOURCE_COUNT.toLocaleString('en-US')} people, then sideways through the year.`},
                {module: Component, cls: ['year-plan-spacer'], flex: 1},
                {
                    module: Component,
                    cls   : ['year-plan-legend'],
                    vdom  : {
                        tag: 'div',
                        cn : [
                            {tag: 'span', cls: ['year-plan-legend-item', 'year-plan-legend-delivery'], text: 'Delivery'},
                            {tag: 'span', cls: ['year-plan-legend-item', 'year-plan-legend-review'],   text: 'Review'},
                            {tag: 'span', cls: ['year-plan-legend-item', 'year-plan-legend-oncall'],   text: 'On-call'}
                        ]
                    }
                },
                {module: Button, cls: ['year-plan-zoom', 'year-plan-zoom-first'], reference: 'zoom-day',  text: 'Day',     pressed: false, handler: 'up.onDay'},
                {module: Button, cls: ['year-plan-zoom'],                         reference: 'zoom-week', text: 'Week',    pressed: false, handler: 'up.onWeek'},
                {module: Button, cls: ['year-plan-zoom', 'year-plan-zoom-last'],  reference: 'zoom-3w',   text: '3 Weeks', pressed: true,  handler: 'up.onThreeWeeks'},
                {module: ThemeSwitcher}
            ]
        }, {
            module        : Scheduler,
            reference     : 'scheduler',
            flex          : 1,
            rowHeight     : 44,
            majorTickUnit : THREE_WEEK_ZOOM.majorTickUnit,
            majorTickStep : THREE_WEEK_ZOOM.majorTickStep,
            majorFormatter: tick => tick.unit === 'week'
                ? `Week · ${weekDateFormatter.format(tick.date)}`
                : shortDateFormatter.format(tick.date),
            resourceColumns: [
                {dataField: 'name',     text: 'Person',      width: 134, locked: 'start'},
                {dataField: 'teamSite', text: 'Team · Site', width: 128, locked: null}
            ],
            store: {
                model: {
                    fields: [
                        {name: 'id'},
                        {name: 'name'},
                        {name: 'team'},
                        {name: 'site'},
                        {name: 'teamSite'}
                    ]
                },
                data: people
            },
            eventStore: {
                model: {
                    module: EventModel,
                    fields: [
                        {name: 'kind', type: 'String', defaultValue: 'delivery'}
                    ]
                },
                data: bookings
            },
            barRenderer: (barDescriptor, {vdom}) => {
                const cls = BAR_CLS_BY_KIND[barDescriptor.bar.kind];

                if (cls) {
                    vdom.cls.push(cls)
                }

                return vdom
            },
            timeAxis: {
                start      : AXIS_START,
                end        : AXIS_END,
                timeZone   : 'UTC',
                tickUnit   : THREE_WEEK_ZOOM.tickUnit,
                tickStep   : THREE_WEEK_ZOOM.tickStep,
                pxPerMinute: THREE_WEEK_ZOOM.pxPerMinute,
                snapMinutes: THREE_WEEK_ZOOM.snapMinutes
            }
        }]
    }

    /** @summary Switches to a detailed day-level planning scale. */
    onDay() {
        this.applyZoom('day', 'zoom-day')
    }

    /** @summary Switches to a medium weekly planning scale. */
    onWeek() {
        this.applyZoom('week', 'zoom-week')
    }

    /** @summary Switches to the 3-week overview scale (~18 days per 1440px viewport across the 52-week axis). */
    onThreeWeeks() {
        this.applyZoom(THREE_WEEK_ZOOM, 'zoom-3w')
    }

    /**
     * @summary Applies the selected timeline preset and synchronizes zoom toolbar button pressed states.
     * @param {String|Object} preset
     * @param {String} activeReference
     * @protected
     */
    applyZoom(preset, activeReference) {
        this.getReference('scheduler').zoomTo(preset);

        for (const ref of ['zoom-day', 'zoom-week', 'zoom-3w']) {
            this.getReference(ref).pressed = ref === activeReference
        }
    }
}

export default Neo.setupClass(BigDataViewport);
