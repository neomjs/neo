import Button        from '../../../src/button/Base.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import EventModel    from '../../../src/timeline/model/Event.mjs';
import EventStore    from '../../../src/timeline/store/Events.mjs';
import Label         from '../../../src/component/Label.mjs';
import Model         from '../../../src/data/Model.mjs';
import Scheduler     from '../../../src/scheduler/Container.mjs';
import Store         from '../../../src/data/Store.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

const
    AXIS_START       = '2026-11-02',
    AXIS_END         = '2026-11-21',
    TOTAL_DAYS       = 19,
    DESKTOP_DAY_PX   = 68,
    COMPACT_DAY_PX   = 26,
    HOLIDAY_KEY      = '2026-11-11',
    HOLIDAY_LABEL    = 'Armistice Day · Wed 11 Nov',
    SHADING_RULE     = 'Shading shows the days. It does not move work.',
    WEEKDAY_SHORT    = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    MONTH_FORMATTER  = new Intl.DateTimeFormat('en-GB', {month: 'short', timeZone: 'UTC'}),
    BAR_CLS_BY_TRADE = {
        civil    : 'neo-scheduler-bar-emerald',
        mep      : 'neo-scheduler-bar-violet',
        structure: 'neo-scheduler-bar-amber'
    },
    WORKING_WEEKS    = [
        {
            key           : 'mon-fri',
            nonWorkingDays: [0, 6],
            shortText     : 'Mon–Fri',
            summary       : 'Mon–Fri · Sat–Sun + Wed 11 Nov shaded',
            text          : 'Monday to Friday'
        },
        {
            key           : 'mon-sat',
            nonWorkingDays: [0],
            shortText     : 'Mon–Sat',
            summary       : 'Mon–Sat · Sundays + Wed 11 Nov shaded',
            text          : 'Monday to Saturday'
        },
        {
            key           : 'sun-thu',
            nonWorkingDays: [5, 6],
            shortText     : 'Sun–Thu',
            summary       : 'Sun–Thu · Fri–Sat + Wed 11 Nov shaded',
            text          : 'Sunday to Thursday'
        }
    ];

const CREWS = [
    {id: 'crew-1', name: 'Site prep',      trade: 'civil'},
    {id: 'crew-2', name: 'Excavation',     trade: 'civil'},
    {id: 'crew-3', name: 'Formwork',       trade: 'structure'},
    {id: 'crew-4', name: 'Rebar & steel',  trade: 'structure'},
    {id: 'crew-5', name: 'Concrete pour',  trade: 'structure'},
    {id: 'crew-6', name: 'Tower crane',    trade: 'structure'},
    {id: 'crew-7', name: 'MEP rough-in',   trade: 'mep'},
    {id: 'crew-8', name: 'Roof & glazing', trade: 'mep'}
];

const WORK_PACKAGES = [
    // Crew 1 — Site prep (pkg-2 spans Weekend 1)
    ['pkg-1',  'crew-1', 'Site access',         '2026-11-02', '2026-11-06', 'civil',     100],
    ['pkg-2',  'crew-1', 'Dewatering',          '2026-11-06', '2026-11-10', 'civil',     75],
    ['pkg-3',  'crew-1', 'Backfill & grade',    '2026-11-16', '2026-11-20', 'civil',     0],
    // Crew 2 — Excavation (pkg-5 spans Wed 11 Nov holiday; pkg-6 spans Weekend 2)
    ['pkg-4',  'crew-2', 'Bulk pit cut',        '2026-11-02', '2026-11-05', 'civil',     100],
    ['pkg-5',  'crew-2', 'Shoring & anchors',   '2026-11-09', '2026-11-13', 'civil',     50],
    ['pkg-6',  'crew-2', 'Utility trenching',   '2026-11-13', '2026-11-17', 'civil',     20],
    // Crew 3 — Formwork (pkg-8 spans Weekend 1; pkg-9 spans Weekend 2)
    ['pkg-7',  'crew-3', 'Footings',            '2026-11-03', '2026-11-06', 'structure', 100],
    ['pkg-8',  'crew-3', 'Core wall forms',     '2026-11-06', '2026-11-10', 'structure', 65],
    ['pkg-9',  'crew-3', 'Deck shuttering',     '2026-11-12', '2026-11-17', 'structure', 15],
    // Crew 4 — Rebar & steel (pkg-10 spans Weekend 1; pkg-11 spans Wed 11 Nov holiday)
    ['pkg-10', 'crew-4', 'Mat cage tie',        '2026-11-04', '2026-11-09', 'structure', 80],
    ['pkg-11', 'crew-4', 'Column cages',        '2026-11-10', '2026-11-13', 'structure', 40],
    ['pkg-12', 'crew-4', 'Slab mesh L2',        '2026-11-17', '2026-11-20', 'structure', 0],
    // Crew 5 — Concrete pour (pkg-13 cures across Weekend 1; pkg-14 cures across Weekend 2)
    ['pkg-13', 'crew-5', 'Foundation cure',     '2026-11-05', '2026-11-09', 'structure', 100],
    ['pkg-14', 'crew-5', 'Core pour & cure',    '2026-11-13', '2026-11-17', 'structure', 25],
    ['pkg-15', 'crew-5', 'Topping slab',        '2026-11-18', '2026-11-21', 'structure', 0],
    // Crew 6 — Tower crane (pkg-17 spans Wed 11 Nov holiday)
    ['pkg-16', 'crew-6', 'Crane setup',         '2026-11-02', '2026-11-05', 'structure', 100],
    ['pkg-17', 'crew-6', 'Steel picks',         '2026-11-09', '2026-11-13', 'structure', 55],
    ['pkg-18', 'crew-6', 'Precast lifts',       '2026-11-16', '2026-11-20', 'structure', 0],
    // Crew 7 — MEP rough-in (pkg-20 spans Weekend 1; pkg-21 spans Weekend 2)
    ['pkg-19', 'crew-7', 'MEP sleeves',         '2026-11-03', '2026-11-06', 'mep',       100],
    ['pkg-20', 'crew-7', 'Pressure hold',       '2026-11-06', '2026-11-10', 'mep',       90],
    ['pkg-21', 'crew-7', 'Duct & conduit',      '2026-11-12', '2026-11-16', 'mep',       30],
    ['pkg-22', 'crew-7', 'Switchgear set',      '2026-11-17', '2026-11-20', 'mep',       0],
    // Crew 8 — Roof & glazing (pkg-24 spans Wed 11 Nov holiday; pkg-25 spans Weekend 2)
    ['pkg-23', 'crew-8', 'Mock-up bay',         '2026-11-02', '2026-11-05', 'mep',       100],
    ['pkg-24', 'crew-8', 'Curtain anchors',     '2026-11-10', '2026-11-13', 'mep',       45],
    ['pkg-25', 'crew-8', 'Membrane seal',       '2026-11-14', '2026-11-18', 'mep',       10]
].map(([id, resourceId, title, startDay, endDay, trade, percentDone]) => ({
    id,
    percentDone,
    resourceId,
    startDate: `${startDay}T00:00:00Z`,
    endDate  : `${endDay}T00:00:00Z`,
    title,
    trade
}));

/**
 * @summary Resource model representing one of the eight construction site crews.
 * @class Neo.examples.scheduler.nonWorkingTime.CrewModel
 * @extends Neo.data.Model
 */
class CrewModel extends Model {
    static config = {
        className: 'Neo.examples.scheduler.nonWorkingTime.CrewModel',
        fields   : [
            {name: 'id',    type: 'String'},
            {name: 'name',  type: 'String'},
            {name: 'trade', type: 'String'}
        ]
    }
}
CrewModel = Neo.setupClass(CrewModel);

/**
 * @summary Event model extending `Neo.timeline.model.Event` with construction `trade` classification.
 * @class Neo.examples.scheduler.nonWorkingTime.WorkPackageModel
 * @extends Neo.timeline.model.Event
 */
class WorkPackageModel extends EventModel {
    static config = {
        className: 'Neo.examples.scheduler.nonWorkingTime.WorkPackageModel',
        fields   : [
            {name: 'trade', type: 'String', defaultValue: 'civil'}
        ]
    }
}
WorkPackageModel = Neo.setupClass(WorkPackageModel);

/**
 * @summary Construction-site scheduler over three weeks with non-working weekend and public-holiday shading.
 * @class Neo.examples.scheduler.nonWorkingTime.Viewport
 * @extends Neo.container.Viewport
 */
class SitePlanViewport extends Viewport {
    static config = {
        className: 'Neo.examples.scheduler.nonWorkingTime.Viewport',
        cls      : ['site-viewport'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module: Toolbar,
            cls   : ['site-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [
                {module: Label, cls: ['site-title'], text: 'Northgate site plan'},
                {
                    module: Component,
                    cls   : ['site-legend'],
                    vdom  : {
                        tag: 'div',
                        cn : [
                            {tag: 'span', cls: ['site-legend-item', 'site-legend-weekend'], text: 'Weekend'},
                            {tag: 'span', cls: ['site-legend-item', 'site-legend-holiday'], text: HOLIDAY_LABEL},
                            {tag: 'span', cls: ['site-legend-item', 'site-legend-civil'],   text: 'Civil'},
                            {tag: 'span', cls: ['site-legend-item', 'site-legend-struct'],  text: 'Structure'},
                            {tag: 'span', cls: ['site-legend-item', 'site-legend-mep'],     text: 'MEP'}
                        ]
                    }
                },
                {module: Component, cls: ['site-spacer'], flex: 1},
                {
                    module   : Button,
                    cls      : ['site-shading-switch'],
                    handler  : 'up.onToggleShading',
                    pressed  : true,
                    reference: 'shading-switch',
                    text     : 'Shading'
                },
                {
                    module: Container,
                    cls   : ['site-week-group'],
                    flex  : 'none',
                    layout: {ntype: 'hbox', align: 'center'},
                    items : [
                        {module: Label, cls: ['site-week-caption'], text: 'Working week'},
                        ...WORKING_WEEKS.map((entry, index) => ({
                            module: Button,
                            cls   : [
                                'site-week-btn',
                                ...(index === 0 ? ['site-week-first'] : []),
                                ...(index === WORKING_WEEKS.length - 1 ? ['site-week-last'] : [])
                            ],
                            handler       : 'up.onSelectWorkingWeek',
                            nonWorkingDays: entry.nonWorkingDays,
                            pressed       : index === 0,
                            reference     : `week-${entry.key}`,
                            shortText     : entry.shortText,
                            summaryText   : entry.summary,
                            text          : entry.text,
                            weekKey       : entry.key
                        }))
                    ]
                },
                {module: ThemeSwitcher, showText: false}
            ]
        }, {
            module: Container,
            cls   : ['site-note-bar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : Label,
                cls      : ['site-note-pill', 'is-shaded'],
                reference: 'calendar-pill',
                text     : WORKING_WEEKS[0].summary
            }, {
                module   : Label,
                cls      : ['site-note-text'],
                reference: 'rule-note',
                text     : SHADING_RULE
            }]
        }, {
            module        : Scheduler,
            barDraggable  : true,
            bufferPx      : 600,
            editable      : false,
            flex          : 1,
            majorFormatter: (tick, axis) => {
                const
                    start = axis.wallTime(tick.date),
                    end   = axis.wallTime(new Date(tick.endDate.getTime() - 1)),
                    month = MONTH_FORMATTER.format(tick.date);

                return `Week ${tick.index + 1} · ${start.getUTCDate()}–${end.getUTCDate()} ${month}`
            },
            majorTickStep : 1,
            majorTickUnit : 'week',
            minorFormatter: (tick, axis) => {
                const d = axis.wallTime(tick.date);
                return axis.totalSize < 1000
                    ? String(d.getUTCDate())
                    : `${WEEKDAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()}`
            },
            reference      : 'scheduler',
            resizableBars  : true,
            resourceColumns: [
                {dataField: 'name', text: 'Site crew', width: 124, locked: 'start'}
            ],
            rowHeight         : 70,
            showNonWorkingTime: true,
            store             : {
                module: Store,
                model : CrewModel,
                data  : CREWS
            },
            eventStore        : {
                module: EventStore,
                model : WorkPackageModel,
                data  : WORK_PACKAGES
            },
            barRenderer       : (barDescriptor, {vdom}) => {
                const cls = BAR_CLS_BY_TRADE[barDescriptor.bar.trade];

                if (cls) {
                    vdom.cls.push(cls)
                }

                return vdom
            },
            timeAxis          : {
                start          : AXIS_START,
                end            : AXIS_END,
                nonWorkingDates: [HOLIDAY_KEY],
                nonWorkingDays : WORKING_WEEKS[0].nonWorkingDays,
                now            : '2026-10-01T00:00:00Z',
                size           : TOTAL_DAYS * DESKTOP_DAY_PX,
                snapMinutes    : 1440,
                tickStep       : 1,
                tickUnit       : 'day',
                timeZone       : 'UTC'
            }
        }]
    }

    #activeSummary = WORKING_WEEKS[0].summary
    #isCompact     = null

    /**
     * @summary Observes the scheduler body width so compact mobile and desktop viewports keep crisp integer day columns.
     */
    onConstructed() {
        super.onConstructed();

        const body = this.getReference('scheduler')?.body;

        if (body) {
            this.observeConfig(body, 'containerWidth', width => this.syncViewportDensity(width));

            if (body.containerWidth > 0) {
                this.syncViewportDensity(body.containerWidth)
            }
        }
    }

    /**
     * @summary Switches `timeAxis.nonWorkingDays` across the three working-week presets and updates the toolbar state.
     * @param {Object} data
     */
    onSelectWorkingWeek({component}) {
        const scheduler = this.getReference('scheduler');

        this.#activeSummary               = component.summaryText;
        scheduler.timeAxis.nonWorkingDays = [...component.nonWorkingDays];

        for (const entry of WORKING_WEEKS) {
            this.getReference(`week-${entry.key}`).pressed = entry.key === component.weekKey
        }

        this.syncCalendarPill()
    }

    /**
     * @summary Toggles `scheduler.showNonWorkingTime` on and off without moving any scheduled work package.
     * @param {Object} data
     */
    onToggleShading({component}) {
        const
            scheduler = this.getReference('scheduler'),
            next      = !scheduler.showNonWorkingTime;

        component.pressed            = next;
        scheduler.showNonWorkingTime = next;
        this.syncCalendarPill()
    }

    /**
     * @summary Reflects the active working-week preset and shading state in the status pill.
     */
    syncCalendarPill() {
        const
            shaded = Boolean(this.getReference('scheduler')?.showNonWorkingTime),
            pill   = this.getReference('calendar-pill');

        pill.set({
            cls : ['site-note-pill', shaded ? 'is-shaded' : 'is-hidden'],
            text: shaded ? this.#activeSummary : 'Shading off · calendar hidden'
        })
    }

    /**
     * @summary Scales `timeAxis.size` to exact integer day widths (`68px` desktop, `26px` mobile) when crossing `768px`.
     * @param {Number} width
     */
    syncViewportDensity(width) {
        if (!width || width <= 0) {
            return
        }

        const compact = width < 768;

        if (compact === this.#isCompact) {
            return
        }

        this.#isCompact = compact;
        this.toggleCls('site-is-compact', compact);

        for (const entry of WORKING_WEEKS) {
            const btn = this.getReference(`week-${entry.key}`);

            if (btn) {
                btn.text = compact ? entry.shortText : entry.text
            }
        }

        const axis = this.getReference('scheduler')?.timeAxis;

        if (axis) {
            axis.size = TOTAL_DAYS * (compact ? COMPACT_DAY_PX : DESKTOP_DAY_PX)
        }
    }
}

export default Neo.setupClass(SitePlanViewport);
