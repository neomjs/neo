import Button                      from '../../../src/button/Base.mjs';
import Component                   from '../../../src/component/Base.mjs';
import Container                   from '../../../src/container/Base.mjs';
import DependencyStore             from './DependencyStore.mjs';
import Gantt                       from '../../../src/gantt/Container.mjs';
import Label                       from '../../../src/component/Label.mjs';
import StateProvider               from '../../../src/state/Provider.mjs';
import TaskStore, {buildSeedTasks} from './TaskStore.mjs';
import ThemeSwitcher               from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar                     from '../../../src/toolbar/Base.mjs';
import Viewport                    from '../../../src/container/Viewport.mjs';

const
    AXIS_START     = '2026-11-02',
    AXIS_END       = '2026-11-25',
    TOTAL_DAYS     = 23,
    DESKTOP_DAY_PX = 53,
    COMPACT_DAY_PX = 18,
    HOLIDAY_KEY    = '2026-11-12',
    WEEKDAY_SHORT  = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    SHORT_DATE_FMT = new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}),
    MONTH_FMT      = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}),
    BAR_CLS_MAP    = {
        finish: 'kitchen-bar-finish',
        mep   : 'kitchen-bar-mep',
        prep  : 'kitchen-bar-prep'
    };

/**
 * @summary Formats a task's `[startValue, endValue)` span as its inclusive last active UTC day
 * (e.g. `'2026-11-05'..'2026-11-12T00:00:00Z'` → `'Wed 11 Nov'`, intra-day `'Mon 16:00Z'` → `'Mon'`).
 * @param {Date|String|Number} startValue
 * @param {Date|String|Number} endValue
 * @returns {String}
 */
function formatInclusiveFinish(startValue, endValue) {
    const
        startMs = startValue instanceof Date ? startValue.getTime() : new Date(startValue).getTime(),
        endMs   = endValue   instanceof Date ? endValue.getTime()   : new Date(endValue).getTime();

    return SHORT_DATE_FMT.format(new Date(Math.max(startMs, endMs - 1)))
}

/**
 * @summary Locked `Task` (`156px`) and `Days` (`48px`) column descriptors (`204px` total), leaving `1236px` on
 * `1440 × 900` (`23 × 53px = 1219px`) and `186px` on `390 × 844` (`10 × 18px = 180px` so `Mon 2..Wed 11` fits on first paint).
 * @type {Object[]}
 */
const TASK_COLUMNS = [{
    columnMenu: false,
    dataField : 'title',
    locked    : 'start',
    sortable  : false,
    text      : 'Task',
    width     : 156
}, {
    cellAlign : 'right',
    cls       : ['kitchen-days-header'],
    columnMenu: false,
    dataField : 'duration',
    locked    : 'start',
    renderer  : ({value}) => `${Math.max(1, Math.round(Number(value) || 1))}d`,
    sortable  : false,
    text      : 'Days',
    width     : 48
}];

/**
 * @summary Kitchen renovation Gantt chart demonstrating `useWorkingTime` duration evaluation across shaded
 * weekends and one public holiday (`Thu 12 Nov`).
 * @description Starts with `"Count working days only"` enabled (`useWorkingTime: true`), so the 5-day `"Rough plumbing & gas"`
 * task starting Thursday `5 Nov` skips `Sat 7–Sun 8 Nov` and finishes at the end of Wednesday `11 Nov` (`2026-11-12T00:00:00Z`),
 * while `"Hood & exterior duct"` (`3d`) crosses the `Thu 12 Nov` holiday and `"Drywall & plaster"` (`2d`) skips both
 * `Thu 12 Nov` and `Sat 14–Sun 15 Nov`. Flipping `gantt.useWorkingTime` delegates rescheduling and `taskChange` publication
 * directly to `Neo.gantt.Container`.
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
            }, {
                module: ThemeSwitcher
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
            module        : Gantt,
            animateCascade: true,
            barMarginPct  : 16,
            bind          : {
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
            taskColumns        : TASK_COLUMNS,
            useWorkingTime     : true,
            barRenderer(barDescriptor, {record, vdom}) {
                const
                    task     = barDescriptor?.event || record,
                    days     = Math.max(1, Math.round(Number(task?.duration) || 1)),
                    widthPx  = parseFloat(vdom?.style?.width) || 0,
                    tradeCls = BAR_CLS_MAP[task?.trade] || 'kitchen-bar-prep',
                    baseName = task?.shortLabel || task?.title || '';

                vdom.cls.push(tradeCls);

                if (widthPx > 0 && widthPx < 24) {
                    return ''
                }
                if (widthPx > 0 && widthPx < 46) {
                    return `${days}d`
                }

                if (days > 1) {
                    let label = baseName;
                    if (widthPx > 0 && widthPx < 155 && baseName === 'Rough plumbing & gas') {
                        label = 'Rough plumbing'
                    } else if (widthPx > 0 && widthPx < 115 && baseName === 'Circuits & LEDs') {
                        label = 'Circuits'
                    }
                    return `${label} (${days}d)`
                }

                return baseName
            },
            majorFormatter: tick => `Week of ${MONTH_FMT.format(tick.date)}`,
            minorFormatter: tick => {
                const d = tick.date;
                return tick.size < 44
                    ? String(d.getUTCDate())
                    : `${WEEKDAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()}`
            },
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
     * @summary Observes grid width so desktop (`53px/day`) and compact mobile (`18px/day`) keep integer day gridlines.
     */
    onConstructed() {
        super.onConstructed();

        const gantt = this.getReference('gantt');

        if (gantt?.body) {
            this.observeConfig(gantt.body, 'containerWidth', width => this.syncViewportDensity(width));

            if (gantt.body.containerWidth > 0) {
                this.syncViewportDensity(gantt.body.containerWidth)
            }
        }

        this.syncSummaryReadout()
    }

    /**
     * @summary Restores the 12 seeded kitchen tasks and re-applies the active working-days setting through the chart.
     */
    onResetPlan() {
        const
            gantt = this.getReference('gantt'),
            store = this.getStateProvider().getStore('tasks');

        store.data = buildSeedTasks();

        if (!gantt.useWorkingTime) {
            gantt.rescheduleWorkingTime(false, true)
        } else {
            gantt.timelineColumn?.refreshMountedRows();
            gantt.syncDependencyLayer()
        }

        this.syncSummaryReadout()
    }

    /**
     * @summary Refreshes the top readout whenever a task edit or working-calendar switch commits.
     */
    onTaskChange() {
        this.syncSummaryReadout()
    }

    /**
     * @summary Flips `gantt.useWorkingTime`; `Neo.gantt.Container` reschedules task spans and dependent tasks.
     * @param {Object} data
     */
    onToggleWorkingDays({component}) {
        const
            gantt = this.getReference('gantt'),
            next  = !gantt.useWorkingTime;

        component.pressed    = next;
        gantt.useWorkingTime = next;
        this.syncSummaryReadout()
    }

    /**
     * @summary Updates the sub-toolbar pill and task finish readout to reflect current `t3` and `t12` dates.
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
                pEnd   = formatInclusiveFinish(plumbing.startDate, plumbing.endDate),
                sEnd   = formatInclusiveFinish(signOff.startDate, signOff.endDate);

            summaryText.text = `Rough plumbing & gas (${pDays}d): ${pStart} → ${pEnd} · Sign-off: ${sEnd}`
        }
    }

    /**
     * @summary Adjusts `timeAxis.size` to integer day widths (`53px` desktop, `18px` compact mobile)
     * so both `1440 × 900` and `390 × 844` display the 5-day Thursday task spanning the shaded weekend on first paint.
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
