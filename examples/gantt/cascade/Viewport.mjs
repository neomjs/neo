import Button                               from '../../../src/button/Base.mjs';
import Component                            from '../../../src/component/Base.mjs';
import Container                            from '../../../src/container/Base.mjs';
import DependencyStore, {SEED_DEPENDENCIES} from './DependencyStore.mjs';
import Gantt                                from '../../../src/gantt/Container.mjs';
import Label                                from '../../../src/component/Label.mjs';
import StateProvider                        from '../../../src/state/Provider.mjs';
import TaskStore, {SEED_BY_ID}              from './TaskStore.mjs';
import ThemeSwitcher                        from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar                              from '../../../src/toolbar/Base.mjs';
import Viewport                             from '../../../src/container/Viewport.mjs';

const
    AXIS_START        = '2026-11-02',
    AXIS_END          = '2026-11-30',
    AXIS_START_MS     = Date.parse(`${AXIS_START}T00:00:00Z`),
    BASE_DAYS         = 28,
    MS_PER_DAY        = 86_400_000,
    WEEK_MS           = 7 * MS_PER_DAY,
    DESKTOP_COL_WIDTH = 204,
    COMPACT_COL_WIDTH = 152,
    WEEKDAY_SHORT     = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    DATE_FMT          = new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}),
    WEEK_FMT          = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}),
    BAR_ROLE_CLS      = {
        beside  : 'cascade-bar-beside',
        chain   : 'cascade-bar-chain',
        goal    : 'cascade-bar-goal',
        trigger : 'cascade-bar-trigger',
        upstream: 'cascade-bar-upstream'
    };

/**
 * @summary Office-move Gantt example showing how a delayed task cascades through its downstream chain
 * while tasks beside the chain keep their dates.
 * @description Twelve fixed-date tasks model an office relocation: ten tasks link in a directed chain from
 * `"Sign the lease"` (`Tue 3 Nov`) through `"Install data cabling"` to `"First day in the new office"` (`Mon 16 Nov`),
 * and two linked tasks (`"Redirect mail & billing"` and `"Clean & return old keys"`) sit beside the chain.
 * Pressing `"Delay the cabling by a week"` or dragging the cabling bar triggers `Neo.gantt.Container#moveTask`
 * with `cascadeDependencies: true` and `animateCascade: true`, gliding downstream bars and links to their new dates
 * and updating the single-line schedule readout above the chart from the engine's `taskChange` receipt.
 * @class Neo.examples.gantt.cascade.Viewport
 * @extends Neo.container.Viewport
 */
class OfficeMoveCascadeViewport extends Viewport {
    /**
     * @summary Builds the single locked task-title column descriptor for a given pixel width.
     * @param {Number} width
     * @returns {Object[]}
     */
    static buildTaskColumns(width) {
        return [{
            columnMenu: false,
            dataField : 'title',
            locked    : 'start',
            sortable  : false,
            text      : 'Task',
            width
        }]
    }

    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.cascade.Viewport'
         * @protected
         */
        className: 'Neo.examples.gantt.cascade.Viewport',
        /**
         * @member {String[]} cls=['cascade-viewport']
         */
        cls: ['cascade-viewport'],
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
            cls   : ['cascade-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['cascade-title'],
                text  : 'Office move'
            }, {
                module: Component,
                cls   : ['cascade-legend'],
                vdom  : {
                    tag: 'div',
                    cn : [
                        {tag: 'span', cls: ['cascade-legend-dot', 'is-trigger'], text: 'Cabling'},
                        {tag: 'span', cls: ['cascade-legend-dot', 'is-chain'],   text: 'Dependent chain'},
                        {tag: 'span', cls: ['cascade-legend-dot', 'is-goal'],    text: 'Move day'},
                        {tag: 'span', cls: ['cascade-legend-dot', 'is-beside'],  text: 'Beside the chain'}
                    ]
                }
            }, {
                module: Component,
                cls   : ['cascade-spacer'],
                flex  : 1
            }, {
                module   : Button,
                cls      : ['cascade-delay-btn'],
                handler  : 'up.onDelayCabling',
                iconCls  : 'fa fa-clock',
                reference: 'delay-btn',
                text     : 'Delay the cabling by a week'
            }, {
                module   : Button,
                cls      : ['cascade-reset-btn'],
                handler  : 'up.onResetPlan',
                iconCls  : 'fa fa-rotate-left',
                reference: 'reset-btn',
                text     : 'Reset',
                ui       : 'secondary'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module: Container,
            cls   : ['cascade-readout-bar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : Label,
                cls      : ['cascade-move-pill', 'is-on-plan'],
                reference: 'move-pill',
                text     : 'Move day: Mon 16 Nov'
            }, {
                module   : Component,
                cls      : ['cascade-readout-text'],
                reference: 'readout-text',
                role     : 'status',
                text     : 'First day in the new office is Mon 16 Nov · 10 linked tasks on the chain, 2 beside it.'
            }]
        }, {
            module             : Gantt,
            animateCascade     : true,
            barMarginPct       : 15,
            bind               : {dependencyStore: 'stores.dependencies', store: 'stores.tasks'},
            cascadeDependencies: true,
            cls                : ['cascade-gantt'],
            dependencyCreation : false,
            editable           : true,
            flex               : 1,
            listeners          : {taskChange: 'up.onTaskChange'},
            majorTickUnit      : 'week',
            reference          : 'gantt',
            rowHeight          : 36,
            showNonWorkingTime : false,
            taskColumns        : this.buildTaskColumns(DESKTOP_COL_WIDTH),
            useWorkingTime     : false,
            barRenderer(barDescriptor, {record, vdom}) {
                const
                    task    = barDescriptor?.event || record,
                    roleCls = BAR_ROLE_CLS[task?.role] || 'cascade-bar-chain',
                    widthPx = parseFloat(vdom?.style?.width) || 0,
                    short   = task?.shortLabel || task?.title || '';

                vdom.cls.push(roleCls);

                if (widthPx > 0 && widthPx < 52) {
                    return ''
                }
                if (widthPx > 0 && widthPx < 164) {
                    return short
                }

                return task?.title || short
            },
            majorFormatter: tick => tick.size < 140
                ? WEEK_FMT.format(tick.date)
                : `Week of ${WEEK_FMT.format(tick.date)}`,
            minorFormatter: tick => {
                const d = tick.date;
                return tick.size < 40
                    ? String(d.getUTCDate())
                    : `${WEEKDAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()}`
            },
            timeAxis: {
                end        : AXIS_END,
                now        : '2026-10-26T00:00:00Z',
                size       : BASE_DAYS * 44,
                snapMinutes: 1440,
                start      : AXIS_START,
                tickStep   : 1,
                tickUnit   : 'day',
                timeZone   : 'UTC'
            }
        }]
    }

    #isCompact       = null
    #lastBodyWidth   = 0
    #motionPollTimer = null

    /**
     * @summary Clears any pending motion-settlement poll timer on teardown.
     * @param {...*} args
     */
    destroy(...args) {
        clearTimeout(this.#motionPollTimer);
        super.destroy(...args)
    }

    /**
     * @summary Formats a UTC date or timestamp as e.g. `'Mon 16 Nov'`.
     * @param {Date|String|Number} value
     * @returns {String}
     */
    formatMoveDay(value) {
        return DATE_FMT.format(value instanceof Date ? value : new Date(value))
    }

    /**
     * @summary Observes grid width so desktop, cover, and phone viewports size integer day columns cleanly.
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

        this.syncReadout()
    }

    /**
     * @summary Delays `"Install data cabling"` by seven days through `Neo.gantt.Container#moveTask`,
     * letting the engine cascade and animate every dependent task down to `"First day in the new office"`.
     */
    onDelayCabling() {
        const
            gantt    = this.getReference('gantt'),
            store    = this.getStateProvider()?.getStore('tasks'),
            cabling  = store?.get('cabling'),
            firstDay = store?.get('first-day'),
            axis     = gantt?.timeAxis;

        if (!gantt || !cabling || !axis) {
            return
        }

        const
            nextStartMs = new Date(cabling.startDate).getTime() + WEEK_MS,
            nextEndMs   = new Date(cabling.endDate).getTime() + WEEK_MS,
            goalEndMs   = (firstDay ? new Date(firstDay.endDate).getTime() : nextEndMs) + WEEK_MS;

        if (goalEndMs > axis.end.getTime()) {
            const extraDays = Math.ceil((goalEndMs - AXIS_START_MS) / MS_PER_DAY) + 1;
            this.syncAxisSize(this.#lastBodyWidth, new Date(AXIS_START_MS + extraDays * MS_PER_DAY))
        }

        gantt.moveTask('cabling', {
            endDate  : new Date(nextEndMs),
            startDate: new Date(nextStartMs)
        })
    }

    /**
     * @summary Restores all 12 tasks, the 11 dependency links, the 28-day time axis, and the first-frame readout.
     */
    onResetPlan() {
        clearTimeout(this.#motionPollTimer);
        this.removeCls('is-cascading');

        const
            gantt    = this.getReference('gantt'),
            provider = this.getStateProvider(),
            links    = provider?.getStore('dependencies'),
            tasks    = provider?.getStore('tasks'),
            axis     = gantt?.timeAxis;

        if (!gantt || !tasks || !links) {
            return
        }

        if (axis && axis.end.getTime() !== Date.parse(`${AXIS_END}T00:00:00Z`)) {
            this.syncAxisSize(this.#lastBodyWidth, AXIS_END)
        }

        tasks.clear();
        links.clear();
        tasks.add(TaskStore.buildSeedTasks());
        links.add(SEED_DEPENDENCIES.map(edge => ({...edge})));

        gantt.timelineColumn?.refreshMountedRows();
        gantt.syncDependencyLayer();
        this.syncReadout()
    }

    /**
     * @summary Updates the schedule readout from the engine's `taskChange` event and tracks cascade motion settlement.
     * @param {Object} event
     */
    onTaskChange(event) {
        this.syncReadout(event);
        this.trackMotionSettlement()
    }

    /**
     * @summary Recomputes integer pixel-per-day width (and optional new axis end) in one batched `TimeAxis#set` update.
     * @param {Number} width
     * @param {Date|String|null} [nextEnd=null]
     */
    syncAxisSize(width, nextEnd = null) {
        const
            gantt = this.getReference('gantt'),
            axis  = gantt?.timeAxis;

        if (!axis) {
            return
        }

        const updates = {};

        if (nextEnd !== null) {
            updates.end = nextEnd
        }

        if (width && width > 0) {
            const
                endMs     = nextEnd instanceof Date
                    ? nextEnd.getTime()
                    : typeof nextEnd === 'string'
                        ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(nextEnd) ? `${nextEnd}T00:00:00Z` : nextEnd)
                        : axis.end.getTime(),
                colWidth  = this.#isCompact ? COMPACT_COL_WIDTH : DESKTOP_COL_WIDTH,
                totalDays = Math.max(1, Math.round((endMs - axis.start.getTime()) / MS_PER_DAY)),
                dayPx     = Math.max(8, Math.floor((width - colWidth - 2) / totalDays));

            updates.size     = totalDays * dayPx;
            updates.tickStep = dayPx < 20 ? 2 : 1
        }

        if (Object.keys(updates).length) {
            axis.set(updates)
        }
    }

    /**
     * @summary Updates the line above the plan with the move day (or old + new move days and moved-task count after a slip).
     * @param {Object|null} [lastChange=null]
     */
    syncReadout(lastChange = null) {
        const
            store       = this.getStateProvider()?.getStore('tasks'),
            movePill    = this.getReference('move-pill'),
            readoutText = this.getReference('readout-text'),
            firstDay    = store?.get('first-day');

        if (!store || !movePill || !readoutText || !firstDay) {
            return
        }

        const
            baseGoalMs    = SEED_BY_ID.get('first-day').startMs,
            currentGoalMs = new Date(firstDay.startDate).getTime(),
            oldDayText    = this.formatMoveDay(baseGoalMs),
            newDayText    = this.formatMoveDay(currentGoalMs),
            slipDays      = Math.round((currentGoalMs - baseGoalMs) / MS_PER_DAY);

        const movedIds   = new Set();
        let   besideKept = 0,
              besideTotal = 0;

        store.forEach(task => {
            const
                seed    = SEED_BY_ID.get(task.id),
                changed = Boolean(seed && (
                    new Date(task.startDate).getTime() !== seed.startMs ||
                    new Date(task.endDate).getTime() !== seed.endMs
                ));

            if (changed) {
                movedIds.add(String(task.id))
            }
            if (task.role === 'beside') {
                besideTotal++;
                if (!changed) {
                    besideKept++
                }
            }
        });

        const
            movedFromSeed   = movedIds.size,
            eventIds        = lastChange?.changesById ? Object.keys(lastChange.changesById) : [],
            eventMovedCount = eventIds.length,
            movedCount      = movedFromSeed || eventMovedCount,
            cascadedCount   = Array.isArray(lastChange?.cascaded) ? lastChange.cascaded.length : 0,
            rootRecord      = lastChange?.record,
            rootSeed        = rootRecord ? SEED_BY_ID.get(rootRecord.id) : null,
            rootDelayed     = Boolean(rootSeed && (
                new Date(rootRecord.startDate).getTime() > rootSeed.startMs ||
                new Date(rootRecord.endDate).getTime() > rootSeed.endMs
            )),
            singleGesture   = eventMovedCount > 0 && movedFromSeed === eventMovedCount && eventIds.every(id => movedIds.has(id)),
            besideClause    = besideKept === besideTotal
                ? `; ${besideTotal} beside the chain kept their dates.`
                : besideKept === 1
                    ? '; 1 beside the chain kept its date, 1 moved.'
                    : '; both beside the chain also moved.',
            detail          = singleGesture
                ? (cascadedCount > 0 ? ` (1 ${rootDelayed ? 'delayed' : 'moved'} + ${cascadedCount} dependent)` : '')
                : eventMovedCount > 0
                    ? ` (latest move: ${eventMovedCount}${cascadedCount > 0 ? `, 1 moved + ${cascadedCount} dependent` : ''})`
                    : '';

        if (movedFromSeed === 0) {
            this.removeCls('is-slipped');
            movePill.set({
                cls : ['cascade-move-pill', 'is-on-plan'],
                text: `Move day: ${oldDayText}`
            });
            readoutText.text = `First day in the new office is ${oldDayText} · 10 linked tasks on the chain, 2 beside it.`;
            return
        }

        this.addCls('is-slipped');

        if (slipDays !== 0) {
            const
                sign      = slipDays > 0 ? `+${slipDays}` : `${slipDays}`,
                dayWord   = Math.abs(slipDays) === 1 ? 'day' : 'days',
                direction = slipDays > 0 ? 'slipped' : 'moved earlier',
                taskWord  = movedCount === 1 ? 'task' : 'tasks';

            movePill.set({
                cls : ['cascade-move-pill', slipDays > 0 ? 'is-slipped' : 'is-on-plan'],
                text: `Move day: ${oldDayText} to ${newDayText} (${sign}d)`
            });
            readoutText.text = `First day in the new office ${direction} from ${oldDayText} to ${newDayText} (${sign} ${dayWord}) · ${movedCount} ${taskWord} moved${detail}${besideClause}`
        } else {
            const taskWord = movedCount === 1 ? 'task' : 'tasks';
            movePill.set({
                cls : ['cascade-move-pill', 'is-on-plan'],
                text: `Move day: ${newDayText} (unchanged)`
            });
            readoutText.text = `First day in the new office stays ${newDayText} · ${movedCount} ${taskWord} moved${detail}${besideClause}`
        }
    }

    /**
     * @summary Adjusts locked column width and integer day width across desktop, cover, and phone viewports.
     * @param {Number} width
     */
    syncViewportDensity(width) {
        if (!width || width <= 0) {
            return
        }

        this.#lastBodyWidth = width;

        const
            compact = width < 560,
            gantt   = this.getReference('gantt');

        if (compact !== this.#isCompact) {
            this.#isCompact = compact;
            this.toggleCls('cascade-is-compact', compact);

            if (gantt) {
                gantt.taskColumns = this.constructor.buildTaskColumns(compact ? COMPACT_COL_WIDTH : DESKTOP_COL_WIDTH)
            }
        }

        this.syncAxisSize(width)
    }

    /**
     * @summary Marks `.cascade-viewport.is-cascading` while `Neo.gantt.CascadeMotion` steps `drawnSpans`
     * and clears it once all bars and links settle at their final dates.
     */
    trackMotionSettlement() {
        clearTimeout(this.#motionPollTimer);

        const gantt = this.getReference('gantt');

        if (!gantt || this.isDestroyed) {
            return
        }

        if (gantt.drawnSpans?.size > 0) {
            this.addCls('is-cascading');
            this.#motionPollTimer = setTimeout(() => this.trackMotionSettlement(), 24)
        } else {
            this.removeCls('is-cascading')
        }
    }
}

export default Neo.setupClass(OfficeMoveCascadeViewport);
