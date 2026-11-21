import Button     from '../../../src/button/Base.mjs';
import Container  from '../../../src/container/Base.mjs';
import EventModel from '../../../src/timeline/model/Event.mjs';
import EventStore from '../../../src/timeline/store/Events.mjs';
import Label      from '../../../src/component/Label.mjs';
import Model      from '../../../src/data/Model.mjs';
import Scheduler  from '../../../src/scheduler/Container.mjs';
import Store      from '../../../src/data/Store.mjs';
import Toolbar    from '../../../src/toolbar/Base.mjs';
import Viewport   from '../../../src/container/Viewport.mjs';

const
    // Monday to Monday in Lisbon, which keeps UTC in December: the venue's clock and the stored times agree
    RANGE   = {start: '2026-12-07', end: '2026-12-14'},
    DAYS    = ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-12', '2026-12-13'],
    OPEN_AT = new Date('2026-12-07T08:00:00Z'), // Monday 08:00, when the venue opens
    // The scheduler's own zoom presets, from one morning to the whole week
    LEVELS  = [
        {preset: 'hour', text: 'Hours'},
        {preset: 'day',  text: 'Days'},
        {preset: 'week', text: 'Week'}
    ];

// [id, name, seats]
const ROOMS = [
    ['main',   'Main hall',        900],
    ['north',  'North auditorium', 400],
    ['south',  'South auditorium', 400],
    ['room-a', 'Room A',           120],
    ['room-b', 'Room B',           120],
    ['room-c', 'Room C',           120],
    ['room-d', 'Room D',           120],
    ['lab-1',  'Lab 1',            40],
    ['lab-2',  'Lab 2',            40],
    ['studio', 'Studio',           6],
    ['board',  'Boardroom',        14],
    ['foyer',  'Foyer stage',      150]
];

// A conference day, Monday to Friday: [room, start, end, kind]
const CONFERENCE_DAY = [
    ['board',  '08:00', '08:45', 'standup'],
    ['main',   '09:00', '10:00', 'keynote'],
    ['north',  '10:30', '11:30', 'talk'], ['north', '13:30', '14:30', 'talk'], ['north', '15:00', '16:00', 'talk'],
    ['south',  '10:30', '11:30', 'talk'], ['south', '13:30', '14:30', 'talk'], ['south', '15:00', '16:00', 'talk'],
    ['room-a', '10:30', '12:00', 'talk'], ['room-a', '14:00', '15:30', 'talk'],
    ['room-b', '10:30', '12:00', 'talk'], ['room-b', '14:00', '15:30', 'talk'],
    ['room-c', '10:30', '12:00', 'talk'], ['room-c', '14:00', '15:30', 'talk'],
    ['room-d', '10:30', '12:00', 'talk'], ['room-d', '14:00', '15:30', 'talk'],
    ['lab-1',  '10:00', '13:00', 'workshop'],
    ['studio', '12:00', '13:00', 'studio'],
    ['foyer',  '12:30', '13:15', 'lightning'],
    ['lab-2',  '14:00', '17:00', 'workshop'],
    ['main',   '16:30', '17:30', 'panel']
];

// The weekend: a community Saturday and a hack day on Sunday
const SATURDAY = [
    ['lab-1',  '10:00', '13:00', 'workshop'],
    ['room-a', '10:00', '11:00', 'openSpace'], ['room-a', '11:30', '12:30', 'openSpace'],
    ['room-b', '10:00', '11:00', 'openSpace'], ['room-b', '11:30', '12:30', 'openSpace'],
    ['main',   '11:00', '12:30', 'meetup'],
    ['foyer',  '13:00', '14:00', 'lightning'],
    ['lab-2',  '14:00', '17:00', 'workshop']
];

const SUNDAY = [
    ['board', '09:00', '10:00', 'standup'],
    ['lab-1', '10:00', '18:00', 'hack'], ['lab-2', '10:00', '18:00', 'hack'],
    ['main',  '16:00', '18:00', 'demos']
];

// Titles by kind, handed out in order through the week
const TITLES = {
    demos    : ['Hack day demos'],
    hack     : ['Hack day'],
    keynote  : ['Opening keynote: the week ahead', 'Keynote: software that explains itself', 'Keynote: the cost of a millisecond',
                'Keynote: building for every network', 'Keynote: shipping every week'],
    lightning: ['Lightning talks'],
    meetup   : ['Community meetup'],
    openSpace: ['Open space: topics from the wall', 'Open space: hiring and growing', 'Open space: tools we love', 'Open space: on-call and rest'],
    panel    : ['Panel: open source after the hype', 'Panel: accessibility as a release gate', 'Panel: teams that own their pager',
                'Panel: data residency in practice', 'Closing panel and awards'],
    standup  : ['Organisers\' stand-up'],
    studio   : ['Speaker interviews, recorded'],
    talk     : ['Streaming data without a queue', 'Grids with a million rows', 'Typed configs, fewer bugs', 'Workers in the browser',
                'Designing for screen readers', 'Caching that survives a deploy', 'Zero-downtime migrations', 'Profiling the main thread',
                'Offline-first forms', 'State machines for UI', 'Security reviews that scale', 'From monolith to modules',
                'Testing time zones', 'Observability on a budget', 'Error budgets in practice', 'Shipping a design system',
                'Charts people can read', 'Search that feels instant', 'Feature flags done right', 'The art of the code review',
                'Building a plugin API', 'Memory leaks we found', 'Edge functions in production', 'Docs developers read',
                'Running a bug bash', 'Pairing across time zones', 'Dark mode without regrets', 'Animations at 60 fps',
                'Internationalising a product', 'Event sourcing in a weekend', 'API versioning stories', 'Load testing for real',
                'Debugging in production', 'Onboarding in one day', 'Small teams, big systems'],
    workshop : ['Workshop: build a dashboard', 'Workshop: accessible components', 'Workshop: profiling, hands on',
                'Workshop: writing e2e tests', 'Workshop: theming from tokens', 'Workshop: a realtime chat', 'Workshop: data grids',
                'Workshop: shipping to the edge', 'Workshop: refactoring legacy code', 'Workshop: your first plugin',
                'Workshop: open hardware', 'Workshop: game jam warm-up']
};

// A bar's colour by kind; a talk keeps the theme's own bar colour
const KIND_CLS = {
    demos    : 'neo-scheduler-bar-violet',
    keynote  : 'neo-scheduler-bar-violet',
    meetup   : 'neo-scheduler-bar-violet',
    panel    : 'neo-scheduler-bar-violet',
    hack     : 'neo-scheduler-bar-emerald',
    openSpace: 'neo-scheduler-bar-emerald',
    workshop : 'neo-scheduler-bar-emerald',
    lightning: 'neo-scheduler-bar-amber',
    standup  : 'neo-scheduler-bar-amber',
    studio   : 'neo-scheduler-bar-amber'
};

// Rooms whose talks start half an hour later on Tuesday and Thursday, so no two days read the same
const LATE_ROOMS = new Set(['north', 'room-b', 'room-d']);

/**
 * @summary Builds the week's 117 sessions from the day programs, in the order a visitor reads them.
 * @returns {Object[]}
 */
function buildSessions() {
    const handedOut = {};

    return DAYS.flatMap((day, dayIndex) => {
        const program = dayIndex < 5 ? CONFERENCE_DAY : dayIndex === 5 ? SATURDAY : SUNDAY;

        return program.map(([resourceId, start, end, kind], index) => {
            const
                late   = dayIndex % 2 === 1 && kind === 'talk' && LATE_ROOMS.has(resourceId) ? 1_800_000 : 0,
                titles = TITLES[kind],
                count  = handedOut[kind] = (handedOut[kind] || 0) + 1;

            return {
                id        : `${day}-${index + 1}`,
                endDate   : new Date(Date.parse(`${day}T${end}:00Z`) + late).toISOString(),
                kind,
                resourceId,
                startDate : new Date(Date.parse(`${day}T${start}:00Z`) + late).toISOString(),
                title     : titles[(count - 1) % titles.length]
            }
        })
    })
}

/**
 * @summary A room of the venue and how many people it seats.
 * @class Neo.examples.scheduler.zoom.RoomModel
 * @extends Neo.data.Model
 */
class RoomModel extends Model {
    static config = {
        className: 'Neo.examples.scheduler.zoom.RoomModel',
        fields   : [
            {name: 'id',    type: 'String'},
            {name: 'name',  type: 'String'},
            {name: 'seats', type: 'Integer'}
        ]
    }
}
RoomModel = Neo.setupClass(RoomModel);

/**
 * @summary A session, extending `Neo.timeline.model.Event` with its kind: talk, keynote, workshop and so on.
 * @class Neo.examples.scheduler.zoom.SessionModel
 * @extends Neo.timeline.model.Event
 */
class SessionModel extends EventModel {
    static config = {
        className: 'Neo.examples.scheduler.zoom.SessionModel',
        fields   : [
            {name: 'kind', type: 'String'}
        ]
    }
}
SessionModel = Neo.setupClass(SessionModel);

/**
 * @summary A conference venue's week, twelve rooms and 117 sessions, read at three zoom levels: Hours for one
 * morning, Days for a day and a half, Week for all seven days.
 * @description The levels are `Neo.scheduler.Container`'s own `zoomPresets`, switched through `zoomTo()`, which keeps
 * the date at the timeline's left edge in place. The plan opens at Days on Monday 08:00, so a zoom to Hours shows
 * Monday morning and a zoom to Week starts the week from there.
 * @class Neo.examples.scheduler.zoom.Viewport
 * @extends Neo.container.Viewport
 */
class VenueViewport extends Viewport {
    static config = {
        className: 'Neo.examples.scheduler.zoom.Viewport',
        cls      : ['venue-viewport'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module: Toolbar,
            cls   : ['venue-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['venue-title'],
                text  : 'Harbour Hall · 7–13 December'
            }, {
                module: Label,
                cls   : ['venue-hint'],
                text  : 'Zoom from one morning to the whole week; the plan keeps its place.'
            }, '->', {
                module   : Container,
                cls      : ['venue-levels'],
                layout   : {ntype: 'hbox'},
                reference: 'levels',
                role     : 'group',
                items    : LEVELS.map(({preset, text}) => ({
                    module   : Button,
                    cls      : ['venue-level'],
                    // Equal shares: on a phone the control spans the toolbar
                    flex     : 1,
                    handler  : 'up.onLevel',
                    pressed  : preset === 'day',
                    reference: `level-${preset}`,
                    text
                }))
            }]
        }, {
            module      : Scheduler,
            barDraggable: false,
            barRenderer : (barDescriptor, {vdom}) => {
                const cls = KIND_CLS[barDescriptor.bar.kind];

                cls && vdom.cls.push(cls);
                return vdom
            },
            editable  : false,
            eventStore: {
                module: EventStore,
                model : SessionModel,
                data  : buildSessions()
            },
            flex           : 1,
            reference      : 'scheduler',
            resizableBars  : false,
            resourceColumns: [{
                dataField: 'name',
                locked   : 'start',
                text     : 'Room',
                width    : 156,
                renderer : ({record}) => ({
                    cn: [
                        {tag: 'span', cls: ['venue-room-name'],  text: record.name},
                        {tag: 'span', cls: ['venue-room-seats'], text: `${record.seats} seats`}
                    ]
                })
            }],
            rowHeight: 64,
            store    : {
                module: Store,
                model : RoomModel,
                data  : ROOMS.map(([id, name, seats]) => ({id, name, seats}))
            },
            timeAxis: {
                ...RANGE,
                ...Scheduler.zoomPresets.day,
                timeZone: 'Europe/Lisbon'
            }
        }]
    }

    /**
     * True once the plan has opened at Monday 08:00, after the scheduler's body was first measured.
     * @member {Boolean} #opened=false
     */
    #opened = false

    /**
     * @summary Names the zoom control for assistive technology, and opens the plan at Monday 08:00, when the venue
     * opens, once the scheduler's body is measured.
     */
    onConstructed() {
        super.onConstructed();

        const scheduler = this.getReference('scheduler');

        this.getReference('levels').changeVdomRootKey('aria-label', 'Zoom');

        this.observeConfig(scheduler.body, 'containerWidth', width => {
            if (width > 0 && !this.#opened) {
                this.#opened = true;
                scheduler.scrollToDate(OPEN_AT)
            }
        })
    }

    /**
     * @summary Zooms to the pressed button's level and marks it as the active one.
     * @param {Object} data
     * @param {Neo.button.Base} data.component
     */
    onLevel({component}) {
        const preset = component.reference.split('-').pop();

        LEVELS.forEach(level => this.getReference(`level-${level.preset}`).pressed = level.preset === preset);
        this.getReference('scheduler').zoomTo(preset)
    }
}

export default Neo.setupClass(VenueViewport);
