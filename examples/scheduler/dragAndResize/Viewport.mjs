import Button        from '../../../src/button/Base.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import EventModel    from '../../../src/timeline/model/Event.mjs';
import Label         from '../../../src/component/Label.mjs';
import Model         from '../../../src/data/Model.mjs';
import Scheduler     from '../../../src/scheduler/Container.mjs';
import Store         from '../../../src/data/Store.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

const
    DEPOT_DAY       = '2026-11-20',
    AXIS_START      = `${DEPOT_DAY}T07:00:00Z`,
    AXIS_END        = `${DEPOT_DAY}T19:00:00Z`,
    MIN_DURATION    = 30,
    DEFAULT_SNAP    = 15,
    SNAP_STEPS      = [5, 15, 30, 60],
    INITIAL_PROMPT  = 'Drag Stop 14 onto Van 3 or pull a stop\'s edge to resize — stops snap to the 15-minute grid (30-min minimum).',
    BAR_CLS_BY_KIND = {
        cold   : 'neo-scheduler-bar-amber',
        freight: 'neo-scheduler-bar-violet',
        parcel : 'neo-scheduler-bar-emerald'
    },
    dayFormatter = new Intl.DateTimeFormat('en-GB', {
        day     : 'numeric',
        month   : 'short',
        timeZone: 'UTC',
        weekday : 'short'
    }),
    timeFormatter = new Intl.DateTimeFormat('en-GB', {
        hour     : '2-digit',
        hourCycle: 'h23',
        minute   : '2-digit',
        timeZone : 'UTC'
    });

const VANS = [
    {id: 'van-1',  name: 'Van 1',  zone: 'Core',      label: 'Van 1 · Core'},
    {id: 'van-2',  name: 'Van 2',  zone: 'Harbor',    label: 'Van 2 · Harbor'},
    {id: 'van-3',  name: 'Van 3',  zone: 'North',     label: 'Van 3 · North'},
    {id: 'van-4',  name: 'Van 4',  zone: 'Westpark',  label: 'Van 4 · West'},
    {id: 'van-5',  name: 'Van 5',  zone: 'Airport',   label: 'Van 5 · Airport'},
    {id: 'van-6',  name: 'Van 6',  zone: 'Eastgate',  label: 'Van 6 · East'},
    {id: 'van-7',  name: 'Van 7',  zone: 'Old Town',  label: 'Van 7 · Old Town'},
    {id: 'van-8',  name: 'Van 8',  zone: 'River',     label: 'Van 8 · River'},
    {id: 'van-9',  name: 'Van 9',  zone: 'Campus',    label: 'Van 9 · Campus'},
    {id: 'van-10', name: 'Van 10', zone: 'South',     label: 'Van 10 · South'}
];

const STOPS = [
    // Van 1 (4 stops)
    [1,  'van-1',  '07:15', '08:15', 'parcel'],
    [2,  'van-1',  '08:45', '10:00', 'cold'],
    [3,  'van-1',  '11:15', '12:30', 'parcel'],
    [4,  'van-1',  '14:00', '15:30', 'freight'],
    // Van 2 (4 stops)
    [5,  'van-2',  '07:30', '09:00', 'freight'],
    [6,  'van-2',  '09:45', '11:00', 'parcel'],
    [7,  'van-2',  '12:30', '13:45', 'cold'],
    [8,  'van-2',  '15:15', '16:45', 'parcel'],
    // Van 3 (3 stops — 07:00–08:30 and 09:45–12:15 open so Stop 14 drops cleanly on mobile or desktop)
    [9,  'van-3',  '08:30', '09:45', 'parcel'],
    [10, 'van-3',  '12:15', '13:30', 'cold'],
    [11, 'van-3',  '15:00', '16:30', 'freight'],
    // Van 4 (4 stops — Stop 14 opens at 07:15–07:45 so it is visible on both 390×844 and 1440×900)
    [14, 'van-4',  '07:15', '07:45', 'parcel'],
    [12, 'van-4',  '08:45', '10:15', 'cold'],
    [15, 'van-4',  '11:30', '13:00', 'freight'],
    [16, 'van-4',  '14:45', '16:00', 'parcel'],
    // Van 5 (4 stops)
    [13, 'van-5',  '07:00', '08:30', 'freight'],
    [17, 'van-5',  '09:15', '10:45', 'parcel'],
    [18, 'van-5',  '12:00', '13:15', 'cold'],
    [19, 'van-5',  '15:30', '17:00', 'freight'],
    // Van 6 (4 stops)
    [20, 'van-6',  '07:45', '09:00', 'parcel'],
    [21, 'van-6',  '10:15', '11:45', 'cold'],
    [22, 'van-6',  '13:15', '14:30', 'parcel'],
    [23, 'van-6',  '16:00', '17:30', 'freight'],
    // Van 7 (3 stops)
    [24, 'van-7',  '08:00', '09:30', 'cold'],
    [25, 'van-7',  '11:00', '12:30', 'parcel'],
    [26, 'van-7',  '14:15', '15:45', 'cold'],
    // Van 8 (4 stops)
    [27, 'van-8',  '07:30', '08:30', 'parcel'],
    [28, 'van-8',  '09:30', '11:00', 'freight'],
    [29, 'van-8',  '12:45', '14:00', 'parcel'],
    [30, 'van-8',  '16:15', '18:00', 'cold'],
    // Van 9 (3 stops)
    [31, 'van-9',  '08:15', '09:45', 'freight'],
    [32, 'van-9',  '11:15', '12:45', 'cold'],
    [33, 'van-9',  '14:30', '16:15', 'parcel'],
    // Van 10 (3 stops)
    [34, 'van-10', '07:45', '09:15', 'parcel'],
    [35, 'van-10', '10:30', '12:00', 'freight'],
    [36, 'van-10', '15:00', '16:30', 'cold']
].map(([num, resourceId, start, end, kind]) => ({
    id       : `stop-${num}`,
    kind,
    resourceId,
    startDate: `${DEPOT_DAY}T${start}:00Z`,
    endDate  : `${DEPOT_DAY}T${end}:00Z`,
    title    : `Stop ${num}`
}));

/**
 * @summary Resource model for the ten delivery vans.
 * @class Neo.examples.scheduler.dragAndResize.VanModel
 * @extends Neo.data.Model
 */
class VanModel extends Model {
    static config = {
        className: 'Neo.examples.scheduler.dragAndResize.VanModel',
        fields   : [
            {name: 'id',    type: 'String'},
            {name: 'name',  type: 'String'},
            {name: 'zone',  type: 'String'},
            {name: 'label', type: 'String'}
        ]
    }
}
VanModel = Neo.setupClass(VanModel);

/**
 * @summary Event model extending `Neo.timeline.model.Event` with delivery stop category (`kind`).
 * @class Neo.examples.scheduler.dragAndResize.StopModel
 * @extends Neo.timeline.model.Event
 */
class StopModel extends EventModel {
    static config = {
        className: 'Neo.examples.scheduler.dragAndResize.StopModel',
        fields   : [
            {name: 'kind', type: 'String', defaultValue: 'parcel'}
        ]
    }
}
StopModel = Neo.setupClass(StopModel);

/**
 * @summary Delivery depot dispatch board demonstrating cross-resource drag, edge resize, configurable snap grids, and minimum duration clamping.
 * @class Neo.examples.scheduler.dragAndResize.Viewport
 * @extends Neo.container.Viewport
 */
class DepotViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.scheduler.dragAndResize.Viewport'
         * @protected
         */
        className: 'Neo.examples.scheduler.dragAndResize.Viewport',
        /**
         * @member {String[]} cls=['depot-viewport']
         * @reactive
         */
        cls: ['depot-viewport'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['depot-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [
                {module: Label, cls: ['depot-title'], text: 'Depot dispatch'},
                {
                    module: Label,
                    cls   : ['depot-badge'],
                    text  : `${VANS.length} vans · ${STOPS.length} stops · 07:00–19:00 UTC`
                },
                {
                    module: Component,
                    cls   : ['depot-legend'],
                    vdom  : {
                        tag: 'div',
                        cn : [
                            {tag: 'span', cls: ['depot-legend-item', 'depot-legend-parcel'],  text: 'Parcel'},
                            {tag: 'span', cls: ['depot-legend-item', 'depot-legend-cold'],    text: 'Cold chain'},
                            {tag: 'span', cls: ['depot-legend-item', 'depot-legend-freight'], text: 'Liftgate'}
                        ]
                    }
                },
                {module: Component, cls: ['depot-spacer'], flex: 1},
                {
                    module: Container,
                    cls   : ['depot-snap-group'],
                    flex  : 'none',
                    layout: {ntype: 'hbox', align: 'center'},
                    items : [
                        {module: Label, cls: ['depot-snap-caption'], text: 'Snap grid'},
                        ...SNAP_STEPS.map((minutes, index) => ({
                            module: Button,
                            cls   : [
                                'depot-snap-btn',
                                ...(index === 0 ? ['depot-snap-first'] : []),
                                ...(index === SNAP_STEPS.length - 1 ? ['depot-snap-last'] : [])
                            ],
                            handler  : 'up.onSelectSnap',
                            pressed  : minutes === DEFAULT_SNAP,
                            reference: `snap-${minutes}`,
                            snapStep : minutes,
                            text     : `${minutes}m`
                        }))
                    ]
                },
                {module: ThemeSwitcher}
            ]
        }, {
            module   : Container,
            cls      : ['depot-status-bar'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            reference: 'status-bar',
            items    : [{
                module   : Label,
                cls      : ['depot-status-pill', 'is-idle'],
                reference: 'status-pill',
                text     : 'Ready'
            }, {
                module   : Label,
                cls      : ['depot-status-text'],
                reference: 'status-text',
                text     : INITIAL_PROMPT
            }, {
                module: Component,
                cls   : ['depot-status-spacer'],
                flex  : 1
            }, {
                module   : Label,
                cls      : ['depot-status-meta'],
                reference: 'status-meta',
                text     : `${DEFAULT_SNAP}-min grid · ${MIN_DURATION}-min min`
            }]
        }, {
            module                          : Scheduler,
            barDraggable                    : true,
            editable                        : false,
            enableResizingAcrossOppositeEdge: false,
            flex                            : 1,
            majorFormatter                  : tick => `${dayFormatter.format(tick.date)} · 07:00–19:00 UTC`,
            majorTickStep                   : 1,
            majorTickUnit                   : 'day',
            minimumDuration                 : MIN_DURATION,
            reference                       : 'scheduler',
            resizableBars                   : true,
            resourceColumns                 : [
                {dataField: 'label', text: 'Van · Route', width: 136, locked: 'start'}
            ],
            rowHeight: 66,
            store    : {
                module: Store,
                model : VanModel,
                data  : VANS
            },
            eventStore: {
                model: StopModel,
                data : STOPS
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
                pxPerMinute: 2.2,
                snapMinutes: DEFAULT_SNAP,
                tickStep   : 1,
                tickUnit   : 'hour',
                timeZone   : 'UTC'
            },
            listeners: {
                eventChange: 'up.onStopChange'
            }
        }]
    }

    /**
     * @summary Last committed status summary restored when a pointer gesture cancels or ends without mutating the record.
     * @member {Object} #lastCommittedStatus
     * @private
     */
    #lastCommittedStatus = {
        meta   : `${DEFAULT_SNAP}-min grid · ${MIN_DURATION}-min min`,
        pill   : 'Ready',
        pillCls: 'is-idle',
        text   : INITIAL_PROMPT
    }

    /**
     * @summary Wires live drag-preview, end, and cancel listeners onto the Scheduler's `eventDragZone` once constructed.
     */
    onConstructed() {
        super.onConstructed();

        const zone = this.getReference('scheduler')?.ensureEventDragZone();

        zone?.on({
            dragCancel: this.onGestureCancel,
            dragEnd   : this.onGestureEnd,
            dragMove  : this.onGestureMove,
            scope     : this
        })
    }

    /**
     * @summary Formats `[startDate, endDate]` and `resourceId` into `"Stop 14 → Van 3, 10:15 to 10:45"`.
     * @param {Neo.data.Model} record
     * @param {Date|String|Number} startDate
     * @param {Date|String|Number} endDate
     * @param {String} resourceId
     * @returns {{durationMinutes: Number, summary: String}}
     */
    formatGestureSummary(record, startDate, endDate, resourceId) {
        const
            start           = startDate instanceof Date ? startDate : new Date(startDate),
            end             = endDate   instanceof Date ? endDate   : new Date(endDate),
            vanName         = this.getReference('scheduler')?.store.get(resourceId)?.name || resourceId,
            durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000),
            summary         = `${record.title} → ${vanName}, ${timeFormatter.format(start)} to ${timeFormatter.format(end)}`;

        return {durationMinutes, summary}
    }

    /**
     * @summary Restores the last committed status line when `Escape` aborts an in-flight drag or resize.
     */
    onGestureCancel() {
        this.onGestureEnd()
    }

    /**
     * @summary Clears resize preview state and restores the last committed status unless `eventChange` supersedes it.
     */
    onGestureEnd() {
        const {meta, pill, pillCls, text} = this.#lastCommittedStatus;
        this.toggleCls('depot-is-resizing', false);
        this.updateStatusDisplay({meta, pill, pillCls, text})
    }

    /**
     * @summary Previews the snapped target van, start/end window, and clamped duration live during pointer movement.
     * @param {Object} data
     */
    onGestureMove(data) {
        const
            zone   = this.getReference('scheduler')?.eventDragZone,
            record = zone?.eventRecord;

        if (!record || !data?.startDate || !data?.endDate) {
            return
        }

        const
            isResize                   = Boolean(zone.resizeEdge),
            snapMinutes                = this.getReference('scheduler').timeAxis.snapMinutes,
            {durationMinutes, summary} = this.formatGestureSummary(record, data.startDate, data.endDate, data.resourceId);

        this.toggleCls('depot-is-resizing', isResize);
        this.updateStatusDisplay({
            meta   : `${durationMinutes} min · ${snapMinutes}-min grid · ${MIN_DURATION}-min min`,
            pill   : isResize ? 'Resizing' : 'Moving',
            pillCls: 'is-preview',
            text   : summary
        })
    }

    /**
     * @summary Switches `timeAxis.snapMinutes` across `5`, `15`, `30`, and `60` minutes and updates toolbar pressed states.
     * @param {Object} data
     */
    onSelectSnap({component}) {
        const
            minutes   = component.snapStep,
            scheduler = this.getReference('scheduler');

        scheduler.timeAxis.snapMinutes = minutes;

        for (const step of SNAP_STEPS) {
            this.getReference(`snap-${step}`).pressed = step === minutes
        }

        const nextMeta = `${minutes}-min grid · ${MIN_DURATION}-min min`;
        this.#lastCommittedStatus = {
            ...this.#lastCommittedStatus,
            meta: nextMeta
        };

        this.getReference('status-meta').text = nextMeta
    }

    /**
     * @summary Writes the committed move or resize outcome (`"Stop 14 → Van 3, 10:15 to 10:45"`) to the status bar.
     * @param {Object} payload
     */
    onStopChange({action, endDate, record, resourceId, startDate}) {
        const
            snapMinutes                = this.getReference('scheduler').timeAxis.snapMinutes,
            {durationMinutes, summary} = this.formatGestureSummary(record, startDate, endDate, resourceId),
            isResize                   = action === 'resize',
            committed                  = {
                meta   : `${durationMinutes} min · ${snapMinutes}-min grid · ${MIN_DURATION}-min min`,
                pill   : isResize ? 'Resized' : 'Moved',
                pillCls: isResize ? 'is-resized' : 'is-moved',
                text   : summary
            };

        this.#lastCommittedStatus = committed;
        this.toggleCls('depot-is-resizing', false);
        this.updateStatusDisplay(committed)
    }

    /**
     * @summary Updates the status bar pill, summary text, and grid metadata in one pass.
     * @param {{meta: String, pill: String, pillCls: String, text: String}} state
     */
    updateStatusDisplay({meta, pill, pillCls, text}) {
        const pillCmp = this.getReference('status-pill');

        pillCmp.set({
            cls : ['depot-status-pill', pillCls],
            text: pill
        });
        this.getReference('status-text').text = text;
        this.getReference('status-meta').text = meta
    }
}

export default Neo.setupClass(DepotViewport);
