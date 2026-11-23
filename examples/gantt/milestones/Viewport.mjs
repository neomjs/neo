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
    AXIS_END          = '2026-12-08',
    AXIS_NOW          = '2026-11-12T12:00:00Z',
    MS_PER_DAY        = 86_400_000,
    SLIP_DAYS         = 3,
    DESKTOP_COL_WIDTH = 278,
    MEDIUM_COL_WIDTH  = 232,
    COMPACT_COL_WIDTH = 136,
    DESKTOP_MIN_SIZE  = 680,
    COMPACT_MIN_SIZE  = 238,
    DAY_FMT           = new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', timeZone: 'UTC'}),
    GATE_DATE_FMT     = new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}),
    WEEK_FMT          = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}),
    REST_PROMPT       = 'Drag "Audio DSP firmware" right (or press Slip +3 days) — Gates 3–6 cascade together; drag any diamond gate directly to move downstream phases.',
    BAR_ROLE_CLS      = {
        active  : 'milestones-bar-active',
        done    : 'milestones-bar-done',
        trigger : 'milestones-bar-trigger',
        upcoming: 'milestones-bar-upcoming'
    };

/**
 * @summary Beacon 1.0 product-launch Gantt example showcasing diamond milestones as phase gates that move and cascade.
 * @description Three launch phases (`Hardware & BOM`, `Firmware & Lab`, `Pilot & Launch`) contain six work tasks
 * punctuated by six zero-duration milestone gates (`Gate 1 · Spec freeze` through `Gate 6 · Public launch`), each
 * rendered as a centred diamond with its label beside it and finish-to-start links meeting the diamond's left and
 * right points. Slipping `"Audio DSP firmware"` by three days (via drag or the toolbar button) cascades Gates 3–6
 * and their downstream tasks together while upstream Gates 1–2 stay on their signed-off dates.
 * @class Neo.examples.gantt.milestones.Viewport
 * @extends Neo.container.Viewport
 */
class LaunchGatesViewport extends Viewport {
    /**
     * @summary Builds the single locked task-tree column descriptor for a given pixel width and density.
     * @param {Number} width
     * @param {Boolean} [isCompact=false]
     * @returns {Object[]}
     */
    static buildTaskColumns(width, isCompact=false) {
        return [{
            columnMenu: false,
            dataField : isCompact ? 'compactTitle' : 'title',
            locked    : 'start',
            sortable  : false,
            text      : 'Phase / Gate',
            type      : 'tree',
            width
        }]
    }

    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.milestones.Viewport'
         * @protected
         */
        className: 'Neo.examples.gantt.milestones.Viewport',
        /**
         * @member {String[]} cls=['milestones-viewport']
         */
        cls: ['milestones-viewport'],
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
            cls   : ['milestones-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['milestones-title'],
                text  : 'Beacon 1.0 launch'
            }, {
                module: Component,
                cls   : ['milestones-legend'],
                vdom  : {
                    tag: 'div',
                    cn : [
                        {tag: 'span', cls: ['milestones-legend-item', 'is-gate'],    text: 'Release gate'},
                        {tag: 'span', cls: ['milestones-legend-item', 'is-trigger'], text: 'Trigger task'},
                        {tag: 'span', cls: ['milestones-legend-item', 'is-done'],    text: 'Signed off'},
                        {tag: 'span', cls: ['milestones-legend-item', 'is-task'],    text: 'Upcoming'},
                        {tag: 'span', cls: ['milestones-legend-item', 'is-phase'],   text: 'Summary phase'}
                    ]
                }
            }, {
                module: Component,
                cls   : ['milestones-spacer'],
                flex  : 1
            }, {
                module   : Button,
                cls      : ['milestones-slip-btn'],
                handler  : 'up.onSlipFirmware',
                iconCls  : 'fa fa-forward-step',
                reference: 'slip-btn',
                text     : 'Slip DSP firmware +3 days'
            }, {
                module   : Button,
                cls      : ['milestones-reset-btn'],
                disabled : true,
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
            cls   : ['milestones-readout-bar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : Label,
                cls      : ['milestones-launch-pill', 'is-on-plan'],
                reference: 'launch-pill',
                text     : 'Gate 6 · Public launch: Fri 27 Nov'
            }, {
                module   : Component,
                cls      : ['milestones-readout-text'],
                reference: 'readout-text',
                role     : 'status',
                text     : REST_PROMPT
            }]
        }, {
            module             : Gantt,
            animateCascade     : true,
            barMarginPct       : 15,
            bind               : {dependencyStore: 'stores.dependencies', store: 'stores.tasks'},
            cascadeDependencies: true,
            cls                : ['milestones-gantt'],
            dependencyCreation : false,
            editable           : true,
            flex               : 1,
            listeners          : {taskChange: 'up.onTaskChange'},
            majorFormatter     : tick => tick.size < 42
                ? String(tick.date.getUTCDate())
                : tick.size < 96 ? WEEK_FMT.format(tick.date) : `Week of ${WEEK_FMT.format(tick.date)}`,
            majorTickUnit     : 'week',
            minorFormatter    : tick => tick.size < 46 ? String(tick.date.getUTCDate()) : DAY_FMT.format(tick.date),
            reference         : 'gantt',
            rowHeight         : 38,
            showNonWorkingTime: false,
            taskColumns       : this.buildTaskColumns(DESKTOP_COL_WIDTH, false),
            timeAxis          : {
                end        : AXIS_END,
                now        : AXIS_NOW,
                size       : DESKTOP_MIN_SIZE,
                snapMinutes: 1440,
                start      : AXIS_START,
                tickStep   : 1,
                tickUnit   : 'day',
                timeZone   : 'UTC'
            },
            useWorkingTime     : false,
            barRenderer(barDescriptor, {record, vdom}) {
                const task = barDescriptor?.bar || record;

                if (task?.isLeaf === false) {
                    return ''
                }

                if (task?.milestone) {
                    return (this.effectiveViewportWidth < 400 || this.timeAxis?.size < 400)
                        ? (task.shortLabel || task.title)
                        : task.title
                }

                const
                    roleCls     = BAR_ROLE_CLS[task?.role] || 'milestones-bar-upcoming',
                    widthPx     = parseFloat(vdom?.style?.width) || 0,
                    title       = task?.title || '',
                    short       = task?.shortLabel || title,
                    isCyberpunk = this.up?.('viewport')?.theme === 'neo-theme-cyberpunk',
                    charPx      = isCyberpunk ? 8.6 : 7.0;

                vdom.cls.push(roleCls);

                if (widthPx > 0 && widthPx < 44) {
                    return ''
                }
                if (widthPx > 0 && widthPx < title.length * charPx + 20) {
                    return widthPx < short.length * charPx + 16 ? '' : short
                }

                return title
            }
        }]
    }

    /**
     * Tracks the active responsive column tier (`'compact' | 'medium' | 'desktop'`).
     * @member {String|null} #columnTier=null
     * @private
     */
    #columnTier = null

    /**
     * Guards re-entrant summary-phase span sync inside `onTaskChange`.
     * @member {Boolean} #syncingParents=false
     * @private
     */
    #syncingParents = false

    /**
     * @summary Wires responsive timeline sizing after construction.
     */
    onConstructed() {
        super.onConstructed();

        const
            me    = this,
            gantt = me.getReference('gantt');

        if (gantt?.body) {
            me.observeConfig(gantt.body, 'containerWidth',  () => me.syncViewportDensity());
            me.observeConfig(gantt.body, 'availableHeight', () => me.syncViewportDensity());

            if (gantt.body.containerWidth > 0) {
                me.syncViewportDensity()
            }
        }
    }

    /**
     * @summary Resets all 15 tasks/gates and 11 links to their seeded launch dates.
     */
    onResetPlan() {
        const
            me        = this,
            provider  = me.getStateProvider(),
            taskStore = provider.getStore('tasks'),
            depStore  = provider.getStore('dependencies');

        taskStore.data = TaskStore.buildSeedTasks();
        depStore.data  = SEED_DEPENDENCIES.map(edge => ({...edge}));

        me.getReference('gantt')?.syncDependencyLayer?.();
        me.syncReadout(null)
    }

    /**
     * @summary Slips `"Audio DSP firmware"` (`dsp`) forward by 3 days so Gates 3–6 cascade downstream.
     */
    onSlipFirmware() {
        const
            gantt = this.getReference('gantt'),
            dsp   = gantt?.store?.get('dsp');

        if (!gantt || !dsp) {
            return
        }

        const
            startMs = new Date(dsp.startDate).getTime(),
            endMs   = new Date(dsp.endDate).getTime(),
            shiftMs = SLIP_DAYS * MS_PER_DAY;

        gantt.moveTask('dsp', {
            endDate  : new Date(endMs + shiftMs),
            startDate: new Date(startMs + shiftMs)
        }, {source: 'toolbar'})
    }

    /**
     * @summary Updates parent phase spans and the schedule readout when a task or gate moves.
     * @param {Object} receipt
     */
    onTaskChange(receipt) {
        if (this.#syncingParents) {
            return
        }

        this.syncParentSpans();
        this.syncReadout(receipt)
    }

    /**
     * @summary Keeps each summary phase bar spanning its children's earliest start and latest end.
     */
    syncParentSpans() {
        const
            me    = this,
            store = me.getStateProvider()?.getStore('tasks');

        if (!store) {
            return
        }

        me.#syncingParents = true;

        try {
            const count = store.getCount();
            for (const phaseId of ['phase-hw', 'phase-fw', 'phase-ship']) {
                const
                    phase    = store.get(phaseId),
                    children = [];

                for (let i = 0; i < count; i++) {
                    const item = store.getAt(i);
                    if (item?.parentId === phaseId) {
                        children.push(item)
                    }
                }

                if (!phase || !children.length) {
                    continue
                }

                let minMs = Infinity,
                    maxMs = -Infinity;

                for (const child of children) {
                    const s = new Date(child.startDate).getTime(),
                          e = new Date(child.endDate).getTime();

                    if (s < minMs) minMs = s;
                    if (e > maxMs) maxMs = e
                }

                if (Number.isFinite(minMs) && Number.isFinite(maxMs)) {
                    const prevStart = new Date(phase.startDate).getTime(),
                          prevEnd   = new Date(phase.endDate).getTime();

                    if (prevStart !== minMs || prevEnd !== maxMs) {
                        phase.set({
                            endDate  : new Date(maxMs),
                            startDate: new Date(minMs)
                        })
                    }
                }
            }

            me.getReference('gantt')?.syncDependencyLayer?.()
        } finally {
            me.#syncingParents = false
        }
    }

    /**
     * @summary Syncs the Gate 6 pill and status line from live store dates and the latest move receipt.
     * @param {Object|null} receipt
     */
    syncReadout(receipt) {
        const
            me         = this,
            store      = me.getStateProvider()?.getStore('tasks'),
            launchGate = store?.get('gate-launch'),
            pill       = me.getReference('launch-pill'),
            readout    = me.getReference('readout-text'),
            resetBtn   = me.getReference('reset-btn');

        if (!launchGate || !pill || !readout) {
            return
        }

        let isDirty = false;
        for (let i = 0, n = store.getCount(); i < n; i++) {
            const item = store.getAt(i),
                  seed = SEED_BY_ID.get(item?.id);

            if (seed && item.isLeaf !== false && (
                new Date(item.startDate).getTime() !== seed.startMs ||
                new Date(item.endDate).getTime()   !== seed.endMs
            )) {
                isDirty = true;
                break
            }
        }

        if (resetBtn) {
            resetBtn.disabled = !isDirty
        }

        const
            launchMs   = new Date(launchGate.startDate).getTime(),
            seedLaunch = SEED_BY_ID.get('gate-launch')?.startMs ?? launchMs,
            deltaDays  = Math.round((launchMs - seedLaunch) / MS_PER_DAY),
            dateText   = GATE_DATE_FMT.format(new Date(launchMs)),
            slipped    = deltaDays !== 0,
            suffix     = deltaDays > 0 ? ` (+${deltaDays}d)` : deltaDays < 0 ? ` (${deltaDays}d)` : '';

        pill.set({
            cls : ['milestones-launch-pill', slipped ? 'is-slipped' : 'is-on-plan'],
            text: `Gate 6 · Public launch: ${dateText}${suffix}`
        });

        if (!receipt) {
            readout.text = REST_PROMPT;
            return
        }

        const
            movedRecord   = receipt.record || store.get(receipt.taskId),
            movedTitle    = movedRecord?.title || 'Task',
            cascadedGates = (receipt.cascaded || [])
                .map(entry => entry?.record || store.get(entry?.taskId))
                .filter(task => task?.milestone);

        if (cascadedGates.length > 0) {
            readout.text = `Moved "${movedTitle}" → ${cascadedGates.length} downstream milestone gate${cascadedGates.length === 1 ? '' : 's'} (${cascadedGates.map(g => g.shortLabel).join(', ')}) shifted with it; Gates 1–2 stayed put.`
        } else {
            readout.text = `Moved "${movedTitle}" to ${GATE_DATE_FMT.format(new Date(movedRecord?.startDate || launchMs))}.`
        }
    }

    /**
     * @summary Fits all 36 days and 6 milestone gates inside the visible timeline track on desktop, cover, and phone viewports.
     */
    syncViewportDensity() {
        const
            gantt           = this.getReference('gantt'),
            containerWidth  = gantt?.body?.containerWidth || 0,
            availableHeight = gantt?.body?.availableHeight || 0;

        if (!(containerWidth > 0) || !gantt?.timeAxis) {
            return
        }

        const
            isCompact       = containerWidth < 640,
            isMedium        = !isCompact && containerWidth < 1100,
            tier            = isCompact ? 'compact' : isMedium ? 'medium' : 'desktop',
            colWidth        = isCompact ? COMPACT_COL_WIDTH : isMedium ? MEDIUM_COL_WIDTH : DESKTOP_COL_WIDTH,
            minSize         = isCompact ? COMPACT_MIN_SIZE  : DESKTOP_MIN_SIZE,
            clipWidth       = Math.max(minSize, Math.floor(containerWidth - colWidth - 2)),
            tickStep        = isCompact ? 5 : isMedium ? 2 : 1,
            targetRowHeight = availableHeight > 0 && availableHeight < 580
                ? Math.max(22, Math.floor((availableHeight - 6) / 15))
                : 38;

        if (this.#columnTier !== tier) {
            this.#columnTier  = tier;
            gantt.taskColumns = this.constructor.buildTaskColumns(colWidth, isCompact)
        }

        if (gantt.rowHeight !== targetRowHeight) {
            gantt.rowHeight = targetRowHeight;
            (gantt.view?.bodies || [gantt.body]).forEach(body => {
                if (body?.availableHeight > 0) {
                    body.availableRows = Math.ceil(body.availableHeight / targetRowHeight) - 1;
                    body.createViewData(false, true)
                }
            })
        }

        const axisUpdates = {};
        if (gantt.timeAxis.size !== clipWidth) {
            axisUpdates.size = clipWidth
        }
        if (gantt.timeAxis.tickStep !== tickStep) {
            axisUpdates.tickStep = tickStep
        }
        if (Object.keys(axisUpdates).length > 0) {
            gantt.timeAxis.set(axisUpdates)
        }

        gantt.timelineColumn?.refreshMountedRows?.();
        gantt.syncDependencyLayer?.()
    }
}

export default Neo.setupClass(LaunchGatesViewport);
