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
    AXIS_START       = '2026-11-09T00:00:00Z',
    AXIS_END         = '2026-11-12T00:00:00Z',
    OUTSIDE_NOW      = '2026-10-01T00:00:00Z',
    SHOP_CHECK_MS    = Date.parse('2026-11-09T05:30:00Z'),
    COMPACT_BODY_PX  = 640,
    DESKTOP_HOUR_PPM = 0.5,
    MOBILE_HOUR_PPM  = 0.45,
    dayFormatter     = new Intl.DateTimeFormat('en-GB', {
        day     : 'numeric',
        month   : 'short',
        timeZone: 'UTC',
        weekday : 'short'
    });

const PRESSES = [
    {id: 'press-1', name: 'Press 1 · Litho 8C',       shortName: 'Press 1 · Litho'},
    {id: 'press-2', name: 'Press 2 · Litho 4C',       shortName: 'Press 2 · 4C'},
    {id: 'press-3', name: 'Press 3 · Web Offset',     shortName: 'Press 3 · Web'},
    {id: 'press-4', name: 'Press 4 · Digital Indigo', shortName: 'Press 4 · Indigo'},
    {id: 'press-5', name: 'Press 5 · Wide UV',        shortName: 'Press 5 · UV'},
    {id: 'press-6', name: 'Press 6 · Foil & Emboss',  shortName: 'Press 6 · Foil'},
    {id: 'press-7', name: 'Press 7 · Die-Cut & Fold', shortName: 'Press 7 · Die-Cut'},
    {id: 'press-8', name: 'Press 8 · Stitch & Bind',  shortName: 'Press 8 · Bind'}
];

// [id, press, title, customer, quantity, startIso, endIso, dueIso, percentDone]
const JOB_ROWS = [
    // Press 1 · Litho 8C (5 jobs)
    [1,  'press-1', 'Art catalogue',     'Kunsthalle',    '4,000',  '2026-11-09T00:00:00Z', '2026-11-09T08:30:00Z', '2026-11-09T06:30:00Z', 62],
    [2,  'press-1', 'Autumn lookbook',   'Atelier Nord',  '9,500',  '2026-11-09T09:30:00Z', '2026-11-09T18:00:00Z', '2026-11-09T19:00:00Z', 40],
    [3,  'press-1', 'Museum monographs', 'Belvedere',     '3,200',  '2026-11-09T19:30:00Z', '2026-11-10T06:30:00Z', '2026-11-10T11:00:00Z', 75],
    [4,  'press-1', 'Watchmaking folio', 'Chronos SA',    '6,000',  '2026-11-10T08:00:00Z', '2026-11-10T20:00:00Z', '2026-11-11T02:00:00Z', 55],
    [5,  'press-1', 'Opera season book', 'Staatsoper',    '11,000', '2026-11-10T22:00:00Z', '2026-11-11T14:00:00Z', '2026-11-11T20:00:00Z', 30],

    // Press 2 · Litho 4C (5 jobs)
    [6,  'press-2', 'Annual report',     'Nordic Rail',   '12,000', '2026-11-09T00:00:00Z', '2026-11-09T08:00:00Z', '2026-11-09T12:00:00Z', 88],
    [7,  'press-2', 'Course handbook',   'ETH Press',     '7,500',  '2026-11-09T09:00:00Z', '2026-11-09T17:30:00Z', '2026-11-09T22:00:00Z', 65],
    [8,  'press-2', 'Trade price list',  'Helvetia Tool', '15,000', '2026-11-09T18:30:00Z', '2026-11-10T05:00:00Z', '2026-11-10T06:00:00Z', 42],
    [9,  'press-2', 'Chamber programme', 'Tonhalle',      '8,000',  '2026-11-10T06:30:00Z', '2026-11-10T18:30:00Z', '2026-11-11T00:00:00Z', 70],
    [10, 'press-2', 'Civic voter guide', 'Canton Print',  '25,000', '2026-11-10T20:00:00Z', '2026-11-11T16:00:00Z', '2026-11-11T22:00:00Z', 48],

    // Press 3 · Web Offset (5 jobs)
    [11, 'press-3', 'Weekly insert',     'Metro Post',    '45,000', '2026-11-09T00:30:00Z', '2026-11-09T08:30:00Z', '2026-11-09T09:30:00Z', 45],
    [12, 'press-3', 'Grocers circular',  'Markthalle',    '60,000', '2026-11-09T09:30:00Z', '2026-11-09T19:00:00Z', '2026-11-09T17:00:00Z', 52],
    [13, 'press-3', 'Book review pull',  'Literaturblatt','32,000', '2026-11-09T20:30:00Z', '2026-11-10T08:00:00Z', '2026-11-10T13:00:00Z', 80],
    [14, 'press-3', 'Regional gazette',  'Rhein Kurier',  '38,000', '2026-11-10T09:30:00Z', '2026-11-10T21:30:00Z', '2026-11-11T04:00:00Z', 60],
    [15, 'press-3', 'Weekend magazine',  'Sonntag Media', '52,000', '2026-11-10T23:00:00Z', '2026-11-11T18:00:00Z', '2026-11-11T19:30:00Z', 35],

    // Press 4 · Digital Indigo (5 jobs)
    [16, 'press-4', 'Gala invitations',  'Kunsthaus',     '2,500',  '2026-11-09T00:00:00Z', '2026-11-09T07:30:00Z', '2026-11-09T12:00:00Z', 100],
    [17, 'press-4', 'Investor deck',     'Alpen Bio',     '1,200',  '2026-11-09T08:30:00Z', '2026-11-09T16:30:00Z', '2026-11-09T18:00:00Z', 58],
    [18, 'press-4', 'Wine list cards',   'Kronenhalle',   '1,800',  '2026-11-09T17:30:00Z', '2026-11-10T04:00:00Z', '2026-11-10T09:00:00Z', 90],
    [19, 'press-4', 'Press kit folders', 'Solaris Lab',   '3,000',  '2026-11-10T05:30:00Z', '2026-11-10T17:00:00Z', '2026-11-10T22:00:00Z', 66],
    [20, 'press-4', 'VIP badge run',     'Film Fest',     '4,400',  '2026-11-10T18:30:00Z', '2026-11-11T12:00:00Z', '2026-11-11T10:00:00Z', 25],

    // Press 5 · Wide UV (5 jobs)
    [21, 'press-5', 'Stage banners',     'Messe Hall',    '180',    '2026-11-09T00:30:00Z', '2026-11-09T08:30:00Z', '2026-11-09T07:00:00Z', 35],
    [22, 'press-5', 'Window graphics',   'Globus Retail', '420',    '2026-11-09T09:30:00Z', '2026-11-09T18:30:00Z', '2026-11-09T23:00:00Z', 74],
    [23, 'press-5', 'Wayfinding boards', 'Airport Auth',  '260',    '2026-11-09T20:00:00Z', '2026-11-10T07:30:00Z', '2026-11-10T12:00:00Z', 68],
    [24, 'press-5', 'Lightbox backlit',  'Transit Corp',  '310',    '2026-11-10T09:00:00Z', '2026-11-10T20:30:00Z', '2026-11-10T21:30:00Z', 38],
    [25, 'press-5', 'Exhibition mural',  'Design Museum', '95',     '2026-11-10T22:00:00Z', '2026-11-11T15:00:00Z', '2026-11-11T21:00:00Z', 50],

    // Press 6 · Foil & Emboss (5 jobs)
    [26, 'press-6', 'Reserve labels',    'Vintners Co',   '28,000', '2026-11-09T00:00:00Z', '2026-11-09T08:00:00Z', '2026-11-09T09:30:00Z', 52],
    [27, 'press-6', 'Chocolate sleeves', 'Lindt Atelier', '19,000', '2026-11-09T09:00:00Z', '2026-11-09T17:30:00Z', '2026-11-09T22:30:00Z', 82],
    [28, 'press-6', 'Perfume cartons',   'Maison Or',     '14,000', '2026-11-09T19:00:00Z', '2026-11-10T06:30:00Z', '2026-11-10T05:00:00Z', 44],
    [29, 'press-6', 'Diploma seals',     'Uni Basel',     '5,500',  '2026-11-10T08:00:00Z', '2026-11-10T19:00:00Z', '2026-11-11T01:00:00Z', 72],
    [30, 'press-6', 'Holiday gift tags', 'Confiserie',    '36,000', '2026-11-10T20:30:00Z', '2026-11-11T16:30:00Z', '2026-11-11T23:00:00Z', 40],

    // Press 7 · Die-Cut & Fold (5 jobs)
    [31, 'press-7', 'Tea cartons',       'Alpen Herb',    '18,000', '2026-11-09T00:30:00Z', '2026-11-09T08:00:00Z', '2026-11-09T13:00:00Z', 84],
    [32, 'press-7', 'Pharma blisters',   'Novamed AG',    '22,000', '2026-11-09T09:00:00Z', '2026-11-09T18:00:00Z', '2026-11-09T19:30:00Z', 50],
    [33, 'press-7', 'Coffee pouches',    'Roastery 9',    '16,000', '2026-11-09T19:30:00Z', '2026-11-10T07:00:00Z', '2026-11-10T12:00:00Z', 78],
    [34, 'press-7', 'Board game trays',  'Spielwerk',     '9,000',  '2026-11-10T08:30:00Z', '2026-11-10T20:00:00Z', '2026-11-11T02:00:00Z', 64],
    [35, 'press-7', 'Cosmetic boxes',    'Pure Botanics', '13,500', '2026-11-10T21:30:00Z', '2026-11-11T15:30:00Z', '2026-11-11T17:00:00Z', 28],

    // Press 8 · Stitch & Bind (5 jobs)
    [36, 'press-8', 'Field manual',      'Alpine Club',   '8,500',  '2026-11-09T00:00:00Z', '2026-11-09T08:30:00Z', '2026-11-09T07:00:00Z', 48],
    [37, 'press-8', 'Rail timetable',    'SBB Cargo',     '20,000', '2026-11-09T09:30:00Z', '2026-11-09T18:30:00Z', '2026-11-09T23:30:00Z', 76],
    [38, 'press-8', 'Poetry anthology',  'Suhrkamp Ed',   '4,800',  '2026-11-09T20:00:00Z', '2026-11-10T07:30:00Z', '2026-11-10T13:00:00Z', 85],
    [39, 'press-8', 'Culinary almanac',  'Gault Press',   '10,500', '2026-11-10T09:00:00Z', '2026-11-10T21:00:00Z', '2026-11-10T19:30:00Z', 32],
    [40, 'press-8', 'Yearbook binding',  'Lyceum Alpin',  '6,200',  '2026-11-10T22:30:00Z', '2026-11-11T17:00:00Z', '2026-11-11T23:00:00Z', 56]
];

const JOBS = JOB_ROWS.map(([num, resourceId, title, customer, quantity, startDate, endDate, dueDate, percentDone]) => ({
    id: `job-${num}`,
    customer,
    dueDate,
    endDate,
    percentDone,
    quantity,
    resourceId,
    startDate,
    title
}));

/**
 * @summary Derives a print job's schedule status (`'on-time' | 'at-risk' | 'late'`) from completion progress and customer due time.
 * @param {Object} job
 * @returns {'on-time'|'at-risk'|'late'}
 */
function deriveJobStatus(job) {
    const
        pct     = Number(job?.percentDone) || 0,
        startMs = job?.startDate instanceof Date ? job.startDate.getTime() : Date.parse(job?.startDate),
        endMs   = job?.endDate   instanceof Date ? job.endDate.getTime()   : Date.parse(job?.endDate),
        dueMs   = job?.dueDate   instanceof Date ? job.dueDate.getTime()   : Date.parse(job?.dueDate);

    if (pct >= 100) {
        return 'on-time'
    }

    if (endMs > dueMs || dueMs <= SHOP_CHECK_MS) {
        return 'late'
    }

    const
        slackHours  = (dueMs - endMs) / 3_600_000,
        elapsedFrac = startMs < SHOP_CHECK_MS
            ? Math.min(1, (SHOP_CHECK_MS - startMs) / Math.max(1, endMs - startMs))
            : 0;

    if (slackHours <= 2 || elapsedFrac * 100 - pct >= 25) {
        return 'at-risk'
    }

    return 'on-time'
}

/**
 * @summary Resource model for the eight print shop presses.
 * @class Neo.examples.scheduler.barRenderer.PressModel
 * @extends Neo.data.Model
 */
class PressModel extends Model {
    static config = {
        className: 'Neo.examples.scheduler.barRenderer.PressModel',
        fields   : [
            {name: 'id',        type: 'String'},
            {name: 'name',      type: 'String'},
            {name: 'shortName', type: 'String'}
        ]
    }
}
PressModel = Neo.setupClass(PressModel);

/**
 * @summary Event model extending `Neo.timeline.model.Event` with print-run customer, quantity, deadline, and derived status.
 * @class Neo.examples.scheduler.barRenderer.PrintJobModel
 * @extends Neo.timeline.model.Event
 */
class PrintJobModel extends EventModel {
    static config = {
        className: 'Neo.examples.scheduler.barRenderer.PrintJobModel',
        fields   : [
            {name: 'customer', type: 'String', defaultValue: ''},
            {name: 'quantity', type: 'String', defaultValue: ''},
            {name: 'dueDate',  type: 'Date'},
            {
                name     : 'status',
                type     : 'String',
                depends  : ['percentDone', 'startDate', 'endDate', 'dueDate'],
                calculate: data => deriveJobStatus(data)
            }
        ]
    }
}
PrintJobModel = Neo.setupClass(PrintJobModel);

/**
 * @summary Custom `barRenderer` decorating each bar with its derived status class, `▲ Late` indicator, and `customer · quantity` second line while keeping the engine's `.neo-timeline-bar-progress` fill.
 * @param {Object} barDescriptor
 * @param {Object} context
 * @returns {Object}
 */
function renderJobBar(barDescriptor, {vdom}) {
    const
        {bar, percentDone, title} = barDescriptor,
        status                    = bar?.status || deriveJobStatus(bar),
        pct                       = Math.round(Number(percentDone) || 0),
        barId                     = vdom.id,
        labelNode                 = vdom.cn.find(child => child.id === `${barId}__label`);

    vdom.cls.push('print-bar-rich', `print-bar-${status}`);
    vdom.data.status = status;
    vdom['aria-label'] = `${vdom['aria-label'] || title} — ${status.replace('-', ' ')}, ${pct}% complete, ${bar.customer} (${bar.quantity})`;

    if (labelNode) {
        labelNode.cls.push('print-bar-body');
        delete labelNode.text;

        const topChildren = [];

        if (status === 'late') {
            topChildren.push({
                tag : 'span',
                id  : `${barId}__late`,
                cls : ['print-bar-late-flag'],
                text: '▲ Late'
            })
        } else if (status === 'at-risk') {
            topChildren.push({
                tag : 'span',
                id  : `${barId}__risk`,
                cls : ['print-bar-risk-flag'],
                text: '◆ At risk'
            })
        } else {
            topChildren.push({
                tag : 'span',
                id  : `${barId}__ok`,
                cls : ['print-bar-ok-mark'],
                text: '✓'
            })
        }

        topChildren.push({
            tag : 'span',
            id  : `${barId}__title`,
            cls : ['print-bar-title'],
            text: title
        });

        labelNode.cn = [{
            tag: 'span',
            id : `${barId}__top`,
            cls: ['print-bar-top'],
            cn : topChildren
        }, {
            tag : 'span',
            id  : `${barId}__meta`,
            cls : ['print-bar-meta'],
            text: `${bar.customer} · ${bar.quantity} · ${pct}%`
        }]
    }

    return vdom
}

/**
 * @summary Print shop schedule demonstrating progress fills, derived status classes (`on-time`, `at-risk`, `late`), two-line bar metadata, and live `Plain bars` switching.
 * @class Neo.examples.scheduler.barRenderer.Viewport
 * @extends Neo.container.Viewport
 */
class PrintShopViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.scheduler.barRenderer.Viewport'
         * @protected
         */
        className: 'Neo.examples.scheduler.barRenderer.Viewport',
        /**
         * @member {String[]} cls=['print-viewport']
         * @reactive
         */
        cls: ['print-viewport'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Boolean} plainBars_=false
         * @reactive
         */
        plainBars_: false,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['print-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['print-title'],
                text  : 'Print shop schedule'
            }, {
                module: Label,
                cls   : ['print-badge'],
                text  : '9–11 Nov 2026 · 8 presses'
            }, {
                ntype: 'component',
                cls  : ['print-spacer'],
                flex : 1
            }, {
                module   : Button,
                cls      : ['print-plain-switch'],
                handler  : 'up.onTogglePlainBars',
                pressed  : false,
                reference: 'plain-switch',
                text     : 'Plain bars'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module   : Container,
            cls      : ['print-legend-bar'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            reference: 'legend-bar',
            items    : [{
                module: Component,
                cls   : ['print-legend'],
                vdom  : {
                    cls: ['print-legend'],
                    cn : [{
                        tag : 'span',
                        cls : ['print-legend-pill', 'is-on-time'],
                        text: '✓ On time'
                    }, {
                        tag : 'span',
                        cls : ['print-legend-pill', 'is-at-risk'],
                        text: '◆ At risk'
                    }, {
                        tag : 'span',
                        cls : ['print-legend-pill', 'is-late'],
                        text: '▲ Late'
                    }]
                }
            }, {
                module   : Label,
                cls      : ['print-summary-text'],
                reference: 'summary-label',
                text     : ''
            }]
        }, {
            module         : Scheduler,
            barDraggable   : false,
            barMarginPct   : 9,
            barRenderer    : renderJobBar,
            cls            : ['print-scheduler'],
            editable       : false,
            flex           : 1,
            majorFormatter : tick => dayFormatter.format(tick.date),
            majorTickUnit  : 'day',
            reference      : 'scheduler',
            resizableBars  : false,
            rowHeight      : 82,
            resourceColumns: [{
                dataField: 'shortName',
                locked   : 'start',
                text     : 'Press',
                width    : 136
            }],
            store: {
                module: Store,
                model : PressModel,
                data  : PRESSES
            },
            eventStore: {
                module: EventStore,
                model : PrintJobModel,
                data  : JOBS
            },
            timeAxis: {
                start      : AXIS_START,
                end        : AXIS_END,
                now        : OUTSIDE_NOW,
                pxPerMinute: DESKTOP_HOUR_PPM,
                snapMinutes: 30,
                tickStep   : 4,
                tickUnit   : 'hour',
                timeZone   : 'UTC'
            }
        }]
    }

    #isCompact = null

    /**
     * @summary Observes scheduler body width and computes initial derived status counts.
     */
    onConstructed() {
        super.onConstructed();
        this.updateSummaryLabel();

        const body = this.getReference('scheduler')?.body;

        if (body) {
            this.observeConfig(body, 'containerWidth', width => this.applyResponsiveLayout(width));

            if (body.containerWidth > 0) {
                this.applyResponsiveLayout(body.containerWidth)
            }
        }
    }

    /**
     * @summary Applies or removes `barRenderer` on the live scheduler without reloading when `plainBars` changes.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetPlainBars(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        const
            me        = this,
            legendBar = me.getReference('legend-bar'),
            scheduler = me.getReference('scheduler'),
            toggle    = me.getReference('plain-switch');

        if (toggle) {
            toggle.pressed = value
        }

        legendBar?.toggleCls('is-plain', value);

        if (scheduler) {
            scheduler.barRenderer = value ? null : renderJobBar
        }

        me.updateSummaryLabel()
    }

    /**
     * @summary Toggles `plainBars` when the toolbar switch is clicked.
     */
    onTogglePlainBars() {
        this.plainBars = !this.plainBars
    }

    /**
     * @summary Summarizes derived `on-time`, `at-risk`, and `late` counts across all 40 jobs in the legend banner.
     */
    updateSummaryLabel() {
        const
            label     = this.getReference('summary-label'),
            scheduler = this.getReference('scheduler'),
            store     = scheduler?.eventStore;

        if (!label || !store) {
            return
        }

        const counts = {'on-time': 0, 'at-risk': 0, late: 0};

        for (let i = 0, len = store.getCount(); i < len; i++) {
            const record = store.getAt(i);
            const state  = record?.status || deriveJobStatus(record);
            counts[state] = (counts[state] || 0) + 1
        }

        label.text = this.plainBars
            ? `Plain bars active — ${store.getCount()} jobs keep their progress fill without status classes or customer lines`
            : `${store.getCount()} jobs · ${counts['on-time']} on time · ${counts['at-risk']} at risk · ${counts.late} late`
    }

    /**
     * @summary Adapts hour density when the scheduler body crosses the compact width threshold so all three states fit the first mobile frame.
     * @param {Number} bodyWidth
     */
    applyResponsiveLayout(bodyWidth) {
        if (!bodyWidth || bodyWidth <= 0) {
            return
        }

        const
            compact   = bodyWidth < COMPACT_BODY_PX,
            scheduler = this.getReference('scheduler');

        if (!scheduler || compact === this.#isCompact) {
            return
        }

        this.#isCompact = compact;
        this.toggleCls('is-compact', compact);
        scheduler.timeAxis.pxPerMinute = compact ? MOBILE_HOUR_PPM : DESKTOP_HOUR_PPM
    }
}

export default Neo.setupClass(PrintShopViewport);
