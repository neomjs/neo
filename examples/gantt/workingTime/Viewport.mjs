import Button                      from '../../../src/button/Base.mjs';
import Component                   from '../../../src/component/Base.mjs';
import Container                   from '../../../src/container/Base.mjs';
import DependencyStore             from './DependencyStore.mjs';
import Gantt                       from '../../../src/gantt/Container.mjs';
import Label                       from '../../../src/component/Label.mjs';
import StateProvider               from '../../../src/state/Provider.mjs';
import TaskStore, {buildSeedTasks} from './TaskStore.mjs';
import Toolbar                     from '../../../src/toolbar/Base.mjs';
import Viewport                    from '../../../src/container/Viewport.mjs';

const
    AXIS_START     = '2026-11-02',
    AXIS_END       = '2026-11-21',
    TOTAL_DAYS     = 19,
    DESKTOP_DAY_PX = 63,
    COMPACT_DAY_PX = 28,
    HOLIDAY_KEY    = '2026-11-12',
    MS_PER_DAY     = 86_400_000,
    WEEKDAY_SHORT  = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    SHORT_DATE_FMT = new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}),
    MONTH_FMT      = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}),
    BAR_CLS_MAP    = {
        finish: 'kitchen-bar-finish',
        mep   : 'kitchen-bar-mep',
        prep  : 'kitchen-bar-prep'
    };

/**
 * @summary Formats an exclusive midnight `endDate` as its inclusive last calendar day (e.g. `'2026-11-12T00:00:00Z'` → `'Wed 11 Nov'`).
 * @param {Date|String|Number} endValue
 * @returns {String}
 */
function formatInclusiveFinish(endValue) {
    const ms = endValue instanceof Date ? endValue.getTime() : new Date(endValue).getTime();
    return SHORT_DATE_FMT.format(new Date(ms - MS_PER_DAY))
}

/**
 * @summary Kitchen renovation Gantt chart demonstrating `useWorkingTime` duration evaluation across two shaded
 * weekends (`Sat 7–Sun 8 Nov`, `Sat 14–Sun 15 Nov`) and one public holiday (`Thu 12 Nov`).
 * @description Starts with `"Count working days only"` enabled (`useWorkingTime: true`), so the 5-day `"Rough plumbing & gas"`
 * task starting Thursday `5 Nov` skips `Sat 7–Sun 8 Nov` and finishes at the end of Wednesday `11 Nov` (`2026-11-12T00:00:00Z`),
 * while `"Hood & exterior duct"` (`3d`) crosses the `Thu 12 Nov` holiday and `"Drywall & skim plaster"` (`2d`) skips both
 * `Thu 12 Nov` and `Sat 14–Sun 15 Nov`. Switching working days off recalculates every linked task in calendar days immediately;
 * dragging a bar onto a non-working day snaps forward to the next working morning when `useWorkingTime` is `true` and lands on
 * that non-working day when `false`.
 * @class Neo.examples.gantt.workingTime.Viewport
 * @extends Neo.container.Viewport
 */
class KitchenWorkingTimeViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.workingTime.Viewport'
         * @protected
         */
        className: 'Neo.examples.gantt.workingTime.Viewport',
        /**
         * @member {String[]} cls=['kitchen-viewport']
         */
        cls: ['kitchen-viewport'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {
                dependencies: {module: DependencyStore},
                tasks       : {module: TaskStore}
            }
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['kitchen-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['kitchen-title'],
                text  : 'Kitchen renovation'
            }, {
                module: Component,
                cls   : ['kitchen-legend'],
                vdom  : {
                    tag: 'div',
                    cn : [
                        {tag: 'span', cls: ['kitchen-legend-pill', 'is-weekend'], text: 'Weekend · Sat–Sun'},
                        {tag: 'span', cls: ['kitchen-legend-pill', 'is-holiday'], text: 'Holiday · Thu 12 Nov'},
                        {tag: 'span', cls: ['kitchen-legend-dot', 'is-prep'],     text: 'Strip & shell'},
                        {tag: 'span', cls: ['kitchen-legend-dot', 'is-mep'],      text: 'Plumbing & MEP'},
                        {tag: 'span', cls: ['kitchen-legend-dot', 'is-finish'],   text: 'Cabinetry & stone'}
                    ]
                }
            }, {
                module: Component,
                cls   : ['kitchen-spacer'],
                flex  : 1
            }, {
                module   : Button,
                cls      : ['kitchen-working-switch'],
                handler  : 'up.onToggleWorkingDays',
                pressed  : true,
                reference: 'working-switch',
                text     : 'Count working days only'
            }, {
                module   : Button,
                cls      : ['kitchen-reset-btn'],
                handler  : 'up.onResetPlan',
                reference: 'reset-btn',
                text     : 'Reset',
                ui       : 'secondary'
            }]
        }, {
            module: Container,
            cls   : ['kitchen-summary-bar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : Label,
                cls      : ['kitchen-mode-pill', 'is-working'],
                reference: 'mode-pill',
                text     : 'Working calendar active'
            }, {
                module   : Label,
                cls      : ['kitchen-summary-text'],
                reference: 'summary-text',
                text     : 'Rough plumbing & gas (5d): Thu 5 Nov → Wed 11 Nov · Sign-off: Fri 20 Nov'
            }]
        }, {
            module      : Gantt,
            barMarginPct: 16,
            bind        : {
                dependencyStore: 'stores.dependencies',
                store          : 'stores.tasks'
            },
            cascadeDependencies: true,
            cls                : ['kitchen-gantt'],
            dependencyCreation : false,
            editable           : true,
            flex               : 1,
            listeners          : {taskChange: 'up.onTaskChange'},
            majorTickUnit      : 'week',
            percentDoneField   : 'percentDone',
            reference          : 'gantt',
            rowHeight          : 44,
            showNonWorkingTime : true,
            useWorkingTime     : true,
            barRenderer(barDescriptor, {record, vdom}) {
                const
                    task     = barDescriptor?.event || record,
                    days     = Math.max(1, Math.round(Number(task?.duration) || 1)),
                    widthPx  = parseFloat(vdom?.style?.width) || 0,
                    tradeCls = BAR_CLS_MAP[task?.trade] || 'kitchen-bar-prep';

                vdom.cls.push(tradeCls);
                if (task?.id === 't3') {
                    vdom.cls.push('kitchen-bar-hero')
                }

                if (widthPx > 0 && widthPx < 60) {
                    return `${days}d`
                }

                return task?.shortLabel || `${task?.title || ''} (${days}d)`
            },
            majorFormatter: tick => `Week of ${MONTH_FMT.format(tick.date)}`,
            minorFormatter: tick => {
                const d = tick.date;
                return tick.size < 44
                    ? String(d.getUTCDate())
                    : `${WEEKDAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()}`
            },
            taskColumns: [{
                columnMenu: false,
                dataField : 'title',
                locked    : 'start',
                sortable  : false,
                text      : 'Task',
                width     : 166
            }, {
                cellAlign : 'right',
                cls       : ['kitchen-days-header'],
                columnMenu: false,
                dataField : 'duration',
                locked    : 'start',
                renderer  : ({value}) => `${Math.max(1, Math.round(Number(value) || 1))}d`,
                sortable  : false,
                text      : 'Days',
                width     : 52
            }],
            timeAxis: {
                end            : AXIS_END,
                nonWorkingDates: [HOLIDAY_KEY],
                nonWorkingDays : [0, 6],
                now            : '2026-10-01T00:00:00Z',
                size           : TOTAL_DAYS * DESKTOP_DAY_PX,
                snapMinutes    : 1440,
                start          : AXIS_START,
                tickStep       : 1,
                tickUnit       : 'day',
                timeZone       : 'UTC'
            }
        }]
    }

    #isCompact = null

    /**
     * @summary Observes center timeline width so desktop (`63px/day`) and narrow mobile (`24px/day`) keep integer day gridlines.
     */
    onConstructed() {
        super.onConstructed();

        const body = this.getReference('gantt')?.body;

        if (body) {
            this.observeConfig(body, 'containerWidth', width => this.syncViewportDensity(width));

            if (body.containerWidth > 0) {
                this.syncViewportDensity(body.containerWidth)
            }
        }

        this.syncSummaryReadout()
    }

    /**
     * @summary Restores the 12 seeded kitchen tasks and re-applies the active working-days setting.
     */
    onResetPlan() {
        const
            gantt = this.getReference('gantt'),
            store = this.getStateProvider().getStore('tasks');

        store.data = buildSeedTasks();

        if (!gantt.useWorkingTime) {
            this.recomputeSchedule(false)
        } else {
            gantt.timelineColumn?.refreshMountedRows();
            gantt.syncDependencyLayer();
            this.syncSummaryReadout()
        }
    }

    /**
     * @summary Refreshes the top readout whenever a task is dragged, resized, or edited interactively.
     */
    onTaskChange() {
        this.syncSummaryReadout()
    }

    /**
     * @summary Flips `gantt.useWorkingTime` and re-evaluates all 12 tasks from their stored `duration` (`days`)
     * so switching working days off immediately shortens weekend/holiday-spanning bars and moves successors forward.
     * @param {Object} data
     */
    onToggleWorkingDays({component}) {
        const
            gantt = this.getReference('gantt'),
            next  = !gantt.useWorkingTime;

        component.pressed = next;
        this.recomputeSchedule(next)
    }

    /**
     * @summary Evaluates all task `[startDate, endDate)` intervals in topological FS order from each record's
     * stored `duration` (`days`), skipping weekends and `2026-11-12` when `useWorking` is `true` or counting raw
     * calendar days when `false`.
     * @param {Boolean} useWorking
     */
    recomputeSchedule(useWorking) {
        const
            gantt    = this.getReference('gantt'),
            axis     = gantt?.timeAxis,
            store    = this.getStateProvider().getStore('tasks'),
            depStore = this.getStateProvider().getStore('dependencies');

        if (!gantt || !axis || !store || !depStore) {
            return
        }

        gantt.useWorkingTime = useWorking;

        const
            incoming = new Map(),
            outgoing = new Map(),
            inDegree = new Map(),
            tasks    = [];

        for (let i = 0, n = store.getCount(); i < n; i++) {
            const rec = store.getAt(i);
            if (rec) {
                const id = String(rec.id);
                tasks.push(rec);
                incoming.set(id, []);
                outgoing.set(id, []);
                inDegree.set(id, 0)
            }
        }

        for (let i = 0, n = depStore.getCount(); i < n; i++) {
            const edge = depStore.getAt(i);
            if (!edge) continue;
            const from = String(edge.fromId), to = String(edge.toId);
            if (incoming.has(to) && outgoing.has(from)) {
                incoming.get(to).push(edge);
                outgoing.get(from).push(to);
                inDegree.set(to, inDegree.get(to) + 1)
            }
        }

        const queue = [];
        for (const [id, deg] of inDegree.entries()) {
            if (deg === 0) queue.push(id)
        }

        const spans = new Map();

        for (let cursor = 0; cursor < queue.length; cursor++) {
            const
                id      = queue[cursor],
                rec     = store.get(id),
                inEdges = incoming.get(id) || [],
                days    = Math.max(1, Number(rec.duration) || Number(rec.baseDuration) || 1),
                durMs   = days * MS_PER_DAY;

            let startMs;

            if (inEdges.length === 0) {
                const anchor = rec.startDate ? new Date(rec.startDate).getTime() : new Date(rec.baseStartDate).getTime();
                startMs = useWorking ? axis.snapToWorkingTime(anchor, 1).getTime() : anchor
            } else {
                startMs = -Infinity;
                for (const edge of inEdges) {
                    const predSpan = spans.get(String(edge.fromId));
                    if (!predSpan) continue;
                    const req = gantt.computeRequiredStartMs({
                        durationMs : durMs,
                        lag        : Number(edge.lag) || 0,
                        lagUnit    : edge.lagUnit || 'day',
                        predEndMs  : predSpan.endMs,
                        predStartMs: predSpan.startMs,
                        type       : edge.type || 'FS',
                        useWorking
                    });
                    if (req > startMs) startMs = req
                }
            }

            const endMs = useWorking
                ? axis.addWorkingMs(startMs, durMs).getTime()
                : (startMs + durMs);

            spans.set(id, {startMs, endMs});
            rec.set({
                endDate  : new Date(endMs),
                startDate: new Date(startMs)
            });

            for (const succId of outgoing.get(id) || []) {
                const nextDeg = inDegree.get(succId) - 1;
                inDegree.set(succId, nextDeg);
                if (nextDeg === 0) queue.push(succId)
            }
        }

        gantt.timelineColumn?.refreshMountedRows();
        gantt.syncDependencyLayer();
        this.syncSummaryReadout()
    }

    /**
     * @summary Updates the sub-toolbar pill and task finish readout to reflect current `t3` (`Rough plumbing & gas`)
     * and `t12` (`Hook up range & sign`) dates.
     */
    syncSummaryReadout() {
        const
            gantt       = this.getReference('gantt'),
            store       = this.getStateProvider()?.getStore('tasks'),
            modePill    = this.getReference('mode-pill'),
            summaryText = this.getReference('summary-text');

        if (!gantt || !store || !modePill || !summaryText) {
            return
        }

        const
            useWorking = Boolean(gantt.useWorkingTime),
            plumbing   = store.get('t3'),
            signOff    = store.get('t12');

        modePill.set({
            cls : ['kitchen-mode-pill', useWorking ? 'is-working' : 'is-calendar'],
            text: useWorking ? 'Working calendar active' : 'Calendar days (weekends counted)'
        });

        if (plumbing && signOff) {
            const
                pDays  = Math.max(1, Math.round(Number(plumbing.duration) || 5)),
                pStart = SHORT_DATE_FMT.format(new Date(plumbing.startDate)),
                pEnd   = formatInclusiveFinish(plumbing.endDate),
                sEnd   = formatInclusiveFinish(signOff.endDate);

            summaryText.text = `Rough plumbing & gas (${pDays}d): ${pStart} → ${pEnd} · Sign-off: ${sEnd}`
        }
    }

    /**
     * @summary Adjusts `timeAxis.size` to integer day widths (`63px` desktop, `24px` compact mobile) so both
     * `1440 × 900` and `390 × 844` display the Thursday 5-day task spanning the shaded weekend on first paint.
     * @param {Number} width
     */
    syncViewportDensity(width) {
        if (!width || width <= 0) {
            return
        }

        const compact = width < 520;

        if (compact === this.#isCompact) {
            return
        }

        this.#isCompact = compact;
        this.toggleCls('kitchen-is-compact', compact);

        const switchBtn = this.getReference('working-switch');
        if (switchBtn) {
            switchBtn.text = compact ? 'Working days' : 'Count working days only'
        }

        const axis = this.getReference('gantt')?.timeAxis;

        if (axis) {
            axis.size = TOTAL_DAYS * (compact ? COMPACT_DAY_PX : DESKTOP_DAY_PX)
        }
    }
}

export default Neo.setupClass(KitchenWorkingTimeViewport);
