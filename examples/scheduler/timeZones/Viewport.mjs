import Button     from '../../../src/button/Base.mjs';
import Component  from '../../../src/component/Base.mjs';
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
    // The axis shows Friday to Monday in the chosen zone, so every shift of the weekend stays on it in every city
    RANGE   = {start: '2026-10-30', end: '2026-11-03'},
    OPEN_AT = 20 * 60, // Friday 20:00 in minutes from the axis start, before the first shift in Berlin or Tokyo time
    CITIES  = {
        'Asia/Tokyo'      : {barCls: 'neo-scheduler-bar-violet',  name: 'Tokyo'},
        'Europe/Berlin'   : {barCls: 'neo-scheduler-bar-emerald', name: 'Berlin'},
        'America/New_York': {barCls: 'neo-scheduler-bar-amber',   name: 'New York'}
    },
    VIEWER  = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// [name, zone, Saturday and Sunday as stored, in UTC]. Every agent works the same local hours on both days:
// Tokyo (UTC+9) and Berlin (UTC+1) keep their offset, New York leaves daylight time at 02:00 on Sunday,
// so its Sunday shifts are stored one hour later than its Saturday ones.
const AGENTS = [
    ['Haruto Sato',  'Asia/Tokyo',       ['2026-10-30T22:00', '2026-10-31T06:00'], ['2026-10-31T22:00', '2026-11-01T06:00']], // 07–15 local
    ['Yui Tanaka',   'Asia/Tokyo',       ['2026-10-31T00:00', '2026-10-31T08:00'], ['2026-11-01T00:00', '2026-11-01T08:00']], // 09–17
    ['Kenji Mori',   'Asia/Tokyo',       ['2026-10-31T03:00', '2026-10-31T11:00'], ['2026-11-01T03:00', '2026-11-01T11:00']], // 12–20
    ['Lena Brandt',  'Europe/Berlin',    ['2026-10-31T06:00', '2026-10-31T14:00'], ['2026-11-01T06:00', '2026-11-01T14:00']], // 07–15
    ['Malik Yilmaz', 'Europe/Berlin',    ['2026-10-31T08:00', '2026-10-31T16:00'], ['2026-11-01T08:00', '2026-11-01T16:00']], // 09–17
    ['Greta Vogel',  'Europe/Berlin',    ['2026-10-31T11:00', '2026-10-31T19:00'], ['2026-11-01T11:00', '2026-11-01T19:00']], // 12–20
    ['Marcus Reed',  'America/New_York', ['2026-10-31T11:00', '2026-10-31T19:00'], ['2026-11-01T12:00', '2026-11-01T20:00']], // 07–15
    ['Dana Ortiz',   'America/New_York', ['2026-10-31T13:00', '2026-10-31T21:00'], ['2026-11-01T14:00', '2026-11-01T22:00']], // 09–17
    ['Priya Shah',   'America/New_York', ['2026-10-31T16:00', '2026-11-01T00:00'], ['2026-11-01T17:00', '2026-11-02T01:00']]  // 12–20
];

const formats = new Map();

/**
 * @summary Returns a cached `en-GB` formatter for one zone and option set.
 * @param {String} timeZone
 * @param {Object} options
 * @returns {Intl.DateTimeFormat}
 */
function format(timeZone, options) {
    const key = timeZone + JSON.stringify(options);

    formats.has(key) || formats.set(key, new Intl.DateTimeFormat('en-GB', {...options, timeZone}));
    return formats.get(key)
}

/**
 * @summary Names a zone by its city, `America/New_York` as "New York".
 * @param {String} timeZone
 * @returns {String}
 */
function cityOf(timeZone) {
    return CITIES[timeZone]?.name || timeZone.split('/').pop().replace(/_/g, ' ')
}

/**
 * @summary Returns the zone's offset at an instant, as "UTC+9" or "UTC−5".
 * @param {String} timeZone
 * @param {Date} date
 * @returns {String}
 */
function offsetOf(timeZone, date) {
    const name = format(timeZone, {timeZoneName: 'shortOffset'}).formatToParts(date).find(part => part.type === 'timeZoneName').value;

    return name.replace('GMT', 'UTC').replace('-', '−')
}

/**
 * @summary Labels a day of the axis with its date, the city and its offset; a day whose offset changes names both.
 * @param {{date: Date, endDate: Date}} tick
 * @param {Neo.timeline.TimeAxis} axis
 * @returns {String}
 */
function formatDay(tick, axis) {
    const
        {timeZone} = axis,
        first      = offsetOf(timeZone, tick.date),
        last       = offsetOf(timeZone, new Date(+tick.endDate - 1)),
        day        = format(timeZone, {weekday: 'short', day: 'numeric', month: 'short'}).format(tick.date);

    return `${day} · ${cityOf(timeZone)} · ${first === last ? first : `${first} → ${last}`}`
}

/**
 * @summary Formats an instant's weekday and time on one zone's clock, as "Sun 09:00".
 * @param {String} timeZone
 * @param {Date} date
 * @param {Boolean} [withDay=true]
 * @returns {String}
 */
function clockOf(timeZone, date, withDay=true) {
    const time = format(timeZone, {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(date);

    return withDay ? `${format(timeZone, {weekday: 'short'}).format(date)} ${time}` : time
}

/**
 * @summary Formats a span on one zone's clock, naming the second weekday only when the span crosses midnight.
 * @param {String} timeZone
 * @param {Date} start
 * @param {Date} end
 * @returns {String}
 */
function spanOf(timeZone, start, end) {
    const sameDay = clockOf(timeZone, start).slice(0, 3) === clockOf(timeZone, end).slice(0, 3);

    return `${clockOf(timeZone, start)} – ${clockOf(timeZone, end, !sameDay)}`
}

// A bar names its shift on the agent's own clock, so the axis and the label read two clocks side by side
const SHIFTS = AGENTS.flatMap(([name, zone, ...days], agentIndex) => days.map(([start, end], dayIndex) => ({
    id        : `shift-${agentIndex + 1}-${dayIndex + 1}`,
    endDate   : `${end}:00Z`,
    resourceId: `agent-${agentIndex + 1}`,
    startDate : `${start}:00Z`,
    title     : `${spanOf(zone, new Date(`${start}:00Z`), new Date(`${end}:00Z`))} ${cityOf(zone)} time`,
    zone
})));

// The zone switch: the viewer's own zone first, then the three cities
const CHOICES = [
    {text: `Your zone · ${cityOf(VIEWER)}`, zone: VIEWER},
    ...Object.keys(CITIES).sort((a, b) => cityOf(a).localeCompare(cityOf(b))).map(zone => ({text: cityOf(zone), zone}))
];

/**
 * @summary A support agent and the city whose clock they keep.
 * @class Neo.examples.scheduler.timeZones.AgentModel
 * @extends Neo.data.Model
 */
class AgentModel extends Model {
    static config = {
        className: 'Neo.examples.scheduler.timeZones.AgentModel',
        fields   : [
            {name: 'city', type: 'String'},
            {name: 'id',   type: 'String'},
            {name: 'name', type: 'String'},
            {name: 'zone', type: 'String'}
        ]
    }
}
AgentModel = Neo.setupClass(AgentModel);

/**
 * @summary A shift stored in UTC, extending `Neo.timeline.model.Event` with the zone of the agent who works it.
 * @class Neo.examples.scheduler.timeZones.ShiftModel
 * @extends Neo.timeline.model.Event
 */
class ShiftModel extends EventModel {
    static config = {
        className: 'Neo.examples.scheduler.timeZones.ShiftModel',
        fields   : [
            {name: 'zone', type: 'String'}
        ]
    }
}
ShiftModel = Neo.setupClass(ShiftModel);

/**
 * @summary A follow-the-sun support rota for one weekend, read in Berlin, New York, Tokyo or the viewer's own time.
 * @description The shifts are stored in UTC. Switching the zone re-anchors the time axis on Friday midnight of the
 * chosen city, so the hours and the day boundaries stay in place on screen while every shift moves to its time in
 * that city. On Sunday 1 November New York leaves daylight time: in New York time that day has 25 hours.
 * @class Neo.examples.scheduler.timeZones.Viewport
 * @extends Neo.container.Viewport
 */
class RotaViewport extends Viewport {
    static config = {
        className   : 'Neo.examples.scheduler.timeZones.Viewport',
        cls         : ['tz-viewport'],
        domListeners: [
            {click  : 'onShiftClick',   delegate: '.neo-timeline-bar'},
            {keydown: 'onShiftKeyDown', delegate: '.neo-timeline-bar'}
        ],
        layout      : {ntype: 'vbox', align: 'stretch'},
        items       : [{
            module: Toolbar,
            cls   : ['tz-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['tz-title'],
                text  : 'Support rota · 31 Oct – 1 Nov'
            }, '->', {
                module: Container,
                cls   : ['tz-zones'],
                layout: {ntype: 'hbox'},
                vdom  : {role: 'group', 'aria-label': 'Time zone', cn: []},
                items : CHOICES.map(({text}, index) => ({
                    module   : Button,
                    cls      : ['tz-zone'],
                    handler  : 'up.onZone',
                    pressed  : index === 0,
                    reference: `zone-${index}`,
                    text
                }))
            }]
        }, {
            module   : Component,
            cls      : ['tz-readout'],
            flex     : 'none',
            reference: 'readout',
            vdom     : {tag: 'div', 'aria-live': 'polite', cn: [
                {tag: 'span', cls: ['tz-readout-shift']},
                {tag: 'span', cls: ['tz-readout-stored']},
                {tag: 'span', cls: ['tz-readout-local']}
            ]}
        }, {
            module      : Scheduler,
            barDraggable: false,
            barRenderer : (barDescriptor, {vdom}) => {
                const cls = CITIES[barDescriptor.bar.zone]?.barCls;

                cls && vdom.cls.push(cls);
                return vdom
            },
            editable  : false,
            eventStore: {
                module: EventStore,
                model : ShiftModel,
                data  : SHIFTS
            },
            flex           : 1,
            majorFormatter : formatDay,
            majorTickStep  : 1,
            majorTickUnit  : 'day',
            reference      : 'scheduler',
            resizableBars  : false,
            resourceColumns: [{
                dataField: 'name',
                locked   : 'start',
                text     : 'Agent',
                width    : 150,
                renderer : ({record}) => ({
                    cn: [
                        {tag: 'span', cls: ['tz-agent-name'], text: record.name},
                        {tag: 'span', cls: ['tz-agent-city'], text: record.city}
                    ]
                })
            }],
            rowHeight: 64,
            store    : {
                module: Store,
                model : AgentModel,
                data  : AGENTS.map(([name, zone], index) => ({id: `agent-${index + 1}`, city: cityOf(zone), name, zone}))
            },
            timeAxis: {
                ...RANGE,
                pxPerMinute: 0.75,
                tickStep   : 1,
                tickUnit   : 'hour',
                timeZone   : VIEWER
            }
        }]
    }

    /**
     * The shift the readout describes: Dana Ortiz's Sunday, the first one stored after New York's clock change.
     * @member {String} #chosenShiftId='shift-8-2'
     */
    #chosenShiftId = 'shift-8-2'
    /**
     * True once the plan has opened after the body's first measurement.
     * @member {Boolean} #opened=false
     */
    #opened = false

    /**
     * @summary Marks the chosen shift, fills the readout and opens the plan once the scheduler's body is measured.
     */
    onConstructed() {
        super.onConstructed();

        const {body} = this.getReference('scheduler');

        this.renderReadout();

        // Once the body is measured, then on every new column layout: availableWidth follows the new positions
        this.observeConfig(body, 'containerWidth', width => {
            if (width > 0 && !this.#opened) {
                this.#opened = true;
                this.openPlan()
            }
        });
        this.observeConfig(body, 'availableWidth', () => this.#opened && this.openPlan())
    }

    /**
     * @summary True below 720px, where the plan shows a few hours and opens at the chosen shift instead of Friday 20:00.
     * @returns {Boolean}
     */
    isNarrow() {
        return this.getReference('scheduler').body.containerWidth < 720
    }

    /**
     * @summary Scrolls the plan through the grid's horizontal scrollbar: to Friday 20:00 on the chosen clock, one
     * position for every zone because every axis starts on its own Friday midnight; below 720px to an hour before the
     * chosen shift.
     * @returns {Promise<void>}
     */
    async openPlan() {
        const
            scheduler = this.getReference('scheduler'),
            position  = scheduler?.body.columnPositions.get(scheduler.timelineColumn?.dataField),
            timeAxis  = scheduler?.timeAxis;

        if (!position) {
            return
        }

        const offset = this.isNarrow()
            ? timeAxis.dateToOffset(+scheduler.resolveEventRecord(this.#chosenShiftId).startDate - 3_600_000)
            : OPEN_AT * timeAxis.pxPerMinute;

        // The scrollbar sizes its spacer in its own update; a scroll sent before that lands is clamped to 0
        await scheduler.horizontalScrollbar.promiseUpdate();

        Neo.main.DomAccess.scrollTo({
            direction: 'left',
            id       : scheduler.horizontalScrollbar.id,
            value    : position.x + offset,
            windowId : scheduler.windowId
        })
    }

    /**
     * @summary Chooses the clicked shift for the readout.
     * @param {Object} data
     */
    onShiftClick(data) {
        this.chooseShift(data.path)
    }

    /**
     * @summary Chooses the focused shift for the readout with Enter or Space.
     * @param {Object} data
     */
    onShiftKeyDown(data) {
        (data.key === 'Enter' || data.key === ' ') && this.chooseShift(data.path)
    }

    /**
     * @summary Switches the axis to the pressed button's zone and re-anchors it on that zone's Friday midnight. The
     * scroll position keeps its clock time, so the shifts move; below 720px the plan follows the chosen shift.
     * @param {Object} data
     */
    onZone({component}) {
        const index = Number(component.reference.split('-').pop());

        CHOICES.forEach((choice, i) => this.getReference(`zone-${i}`).pressed = i === index);
        // One set(): the range's day keys resolve in the new zone
        this.getReference('scheduler').timeAxis.set({timeZone: CHOICES[index].zone, ...RANGE});
        this.renderReadout();
        this.isNarrow() && this.openPlan()
    }

    /**
     * @summary Resolves the shift under an event path through the scheduler and shows it in the readout.
     * @param {Object[]} path
     */
    chooseShift(path=[]) {
        const
            scheduler = this.getReference('scheduler'),
            eventId   = scheduler.extractBarTarget(path).barNode?.data?.eventId;

        if (eventId && scheduler.resolveEventRecord(eventId)) {
            this.#chosenShiftId = eventId;
            this.renderReadout()
        }
    }

    /**
     * @summary Marks the chosen shift on the plan and renders the readout: who works it, its stored UTC times and the
     * same span on the chosen clock.
     */
    renderReadout() {
        const
            scheduler                  = this.getReference('scheduler'),
            readout                    = this.getReference('readout'),
            {timeZone}                 = scheduler.timeAxis,
            shift                      = scheduler.resolveEventRecord(this.#chosenShiftId),
            agent                      = scheduler.store.get(shift.resourceId),
            {endDate, startDate}       = shift,
            [shiftNode, stored, local] = readout.vdom.cn;

        scheduler.timelineColumn.highlightedRecordIds = [this.#chosenShiftId];

        shiftNode.text = `${agent.name}, ${agent.city}`;
        stored.text    = `Stored ${spanOf('UTC', startDate, endDate)} UTC`;
        local.text     = `${timeZone === VIEWER ? 'Your time' : cityOf(timeZone)} ${spanOf(timeZone, startDate, endDate)} (${offsetOf(timeZone, startDate)})`;
        readout.update()
    }
}

export default Neo.setupClass(RotaViewport);
