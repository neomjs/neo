import Button                              from '../../../../src/button/Base.mjs';
import Component                           from '../../../../src/component/Base.mjs';
import Container                           from '../../../../src/container/Base.mjs';
import FleetTasks                          from '../../store/FleetTasks.mjs';
import {formatViewerTime, viewerTimeTitle} from './viewerTime.mjs';

/**
 * @summary The three sections, in the order the operator asks: what is in flight, what comes
 * next, what just finished. Each carries the honest empty line it renders when a wired read
 * answered nothing for it.
 * @type {Object[]}
 */
const SECTIONS = Object.freeze([
    {id: 'running', label: 'Running',       empty: 'Nothing in flight.'},
    {id: 'queued',  label: 'Queued · next', empty: 'Nothing scheduled.'},
    {id: 'recent',  label: 'Recent',        empty: 'Nothing completed recently.'}
]);

/**
 * @summary Provenance words per source axis — the pill every row carries.
 * @type {Object}
 */
const SOURCE_LABELS = Object.freeze({
    orchestrator: 'orchestrator',
    mc          : 'memory core',
    kb          : 'knowledge base'
});

/**
 * @summary The meta-line word for each source state the envelope can report.
 * @type {Object}
 */
const SOURCE_STATE_WORDS = Object.freeze({
    wired      : 'live',
    stale      : 'stale',
    degraded   : 'degraded',
    unavailable: 'unavailable',
    unwired    : 'not reachable'
});

/**
 * @summary The cold-spine rows: one per section, labeled `sample` at the section AND the row, so
 * the pane teaches its shape before any bridge answered — exactly like the static roster — without
 * a single row claiming to be the deployment.
 * @type {Object[]}
 */
const SAMPLE_ROWS = Object.freeze([
    {id: 'sample:running', section: 'running', name: 'Tenant repo sync',     source: 'orchestrator', state: 'in progress', at: null, progressKind: 'determinate', progressDone: 42, progressTotal: 100, detail: null},
    {id: 'sample:queued',  section: 'queued',  name: 'Repo sync · 1a2b3c4d', source: 'orchestrator', state: 'scheduled',   at: null, progressKind: null,          progressDone: null, progressTotal: null, detail: null},
    {id: 'sample:recent',  section: 'recent',  name: 'KB ingestion',         source: 'kb',           state: 'completed',   at: null, progressKind: null,          progressDone: null, progressTotal: null, detail: null}
]);

/**
 * The resident Fleet tasks surface: WHAT the deployment is doing — running, queued / next, and
 * recently completed work — beside the grid that says WHO.
 *
 * @summary Renders one viewer-bound `fleetTasks` envelope as three provenance-labeled sections
 * without synthesizing, ranking, or caching it. The pane owns only a local projection Store of
 * task rows; it fires intent events for reads and the owning FleetCockpit holds the authenticated
 * bridge and drives the read at boot and on every liveness tick.
 *
 * Honest states are first-class: the cold spine renders sample-labeled rows (shape, not claim),
 * an unavailable read names its reason, a wired read with an empty section says so in words, a
 * run with no reported fraction carries its state word instead of a bar that would lie, and a
 * backlog gauge is labeled as a queue — never as progress.
 *
 * @class AgentOS.view.fleet.TasksPane
 * @extends Neo.container.Base
 */
class TasksPane extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.TasksPane'
         * @protected
         */
        className: 'AgentOS.view.fleet.TasksPane',
        /**
         * @member {String} ntype='fm-tasks-pane'
         * @protected
         */
        ntype: 'fm-tasks-pane',
        /**
         * @member {String[]} baseCls=['fm-tasks-pane']
         */
        baseCls: ['fm-tasks-pane'],
        /**
         * Latest tasks envelope. `null` is unobserved, never empty.
         * @member {Object|null} snapshot_=null
         * @reactive
         */
        snapshot_: null,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype : 'container',
            cls   : ['fm-tasks-head'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                ntype: 'component',
                cls  : ['fm-tasks-title'],
                flex : 1,
                text : 'What is running'
            }, {
                ntype: 'component',
                cls  : ['fm-tasks-authority'],
                text : 'orchestrator · memory core · knowledge base · query-time'
            }]
        }, {
            ntype    : 'component',
            cls      : ['fm-tasks-meta'],
            flex     : 'none',
            reference: 'tasks-meta',
            text     : 'Tasks not observed yet'
        }, {
            ntype    : 'container',
            cls      : ['fm-tasks-sections'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'tasks-sections'
        }, {
            ntype : 'container',
            cls   : ['fm-tasks-actions'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                ntype: 'component',
                flex : 1
            }, {
                module   : Button,
                reference: 'tasks-refresh',
                text     : 'Refresh',
                iconCls  : 'fa fa-rotate',
                ui       : 'ghost',
                handler  : 'up.onRefreshClick'
            }]
        }]
    }

    /** @member {AgentOS.store.FleetTasks|null} taskStore=null */
    taskStore = null

    /**
     * @summary Create the pane-local Store and render held owner state. No read fires here: the
     * cockpit drives the tasks read at boot and on its liveness tick, so a resident tab constructs
     * on the owner-held snapshot and never queries the plane on its own.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        this.taskStore = Neo.create(FleetTasks);
        this.applySnapshot()
    }

    /** @param {...*} args */
    destroy(...args) {
        this.taskStore?.destroy();
        this.taskStore = null;
        super.destroy(...args)
    }

    /** @param {Object|null} value @param {Object|null} oldValue */
    afterSetSnapshot(value, oldValue) {
        this.isConstructed && this.applySnapshot()
    }

    /** @summary Re-read the deployment's task picture. */
    onRefreshClick() {
        this.fire('tasksRequest', {})
    }

    /**
     * @summary Project the latest envelope into Store rows and honest chrome. A wired or partial
     * read replaces the Store wholesale — rows are a glance at one instant, never an accumulation —
     * and the meta line names every source axis by its own state word, so a partial read is
     * readable as exactly that.
     */
    applySnapshot() {
        const
            me       = this,
            snapshot = me.snapshot,
            metaEl   = me.getReference('tasks-meta'),
            state    = snapshot?.capability?.state,
            wired    = state === 'wired' || state === 'partial',
            // A transport-level fallback (no bridge, unwired verb, a thrown read) carries NO source
            // axes — the cockpit never reached the source. That is the COLD spine, and the cockpit's
            // convention for it is the Activity stream's: keep the labeled sample in place rather
            // than blanking the surface. An envelope WITH axes that all failed is a different fact —
            // the source answered, and the honest render is its empty lines under the reason.
            axes     = Boolean(snapshot?.sources) && Object.keys(snapshot.sources).length > 0,
            cold     = !snapshot || (!wired && !axes);

        if (!me.taskStore) return;

        me.taskStore.clear();

        if (wired) {
            const rows = ['running', 'queued', 'recent']
                .flatMap(section => Array.isArray(snapshot[section]) ? snapshot[section] : [])
                .filter(row => typeof row?.id === 'string' && row.id)
                .map(row => ({
                    id           : row.id,
                    section      : row.section,
                    name         : row.name,
                    source       : row.source,
                    state        : row.state,
                    at           : row.at ?? null,
                    progressKind : row.progress?.kind  ?? null,
                    progressDone : row.progress?.done  ?? null,
                    progressTotal: row.progress?.total ?? null,
                    detail       : row.detail ?? null
                }));

            rows.length > 0 && me.taskStore.add(rows)
        }

        if (metaEl) {
            metaEl.text = !snapshot
                ? 'Tasks not observed yet — the rows below show the shape, not the deployment.'
                : cold
                    ? `Tasks unavailable · ${snapshot.capability?.reason || 'unknown reason'} — the rows below show the shape, not the deployment.`
                    : wired
                        ? `captured ${me.formatStamp(snapshot.capability.capturedAt)} · ${me.sourceLine(snapshot.sources)}`
                        : `Tasks unavailable · ${snapshot.capability?.reason || 'unknown reason'}`;

            // T5 receipt; falsy removes, so the unobserved and unavailable branches — which render
            // no stamp — cannot leave a previous read's instant hovering behind their copy
            metaEl.changeVdomRootKey('title', wired ? viewerTimeTitle(snapshot.capability.capturedAt) : null)
        }

        me.renderSections(wired, cold)
    }

    /**
     * @summary One clause per source axis, each under its own state word — the meta line's
     * honest half: "orchestrator live · memory core live · knowledge base not reachable".
     * @param {Object|null} sources The envelope's `sources` block.
     * @returns {String}
     */
    sourceLine(sources) {
        return Object.entries(SOURCE_LABELS)
            .map(([key, label]) => {
                const axis = sources?.[key === 'orchestrator' ? 'deployment' : key === 'mc' ? 'rem' : 'ingestion'];

                return `${label} ${SOURCE_STATE_WORDS[axis?.state] ?? 'unobserved'}`
            })
            .join(' · ')
    }

    /**
     * @summary Render the three sections into the sections zone: sample rows for the cold spine
     * (unobserved, or a transport-level fallback — the cockpit's fail-closed-never-blank
     * convention), the honest empty lines for a source-level unavailable read, and the Store's
     * rows (or the section's own empty line) for a wired one. Every section head carries its
     * provenance pill.
     * @param {Boolean} wired
     * @param {Boolean} cold
     */
    renderSections(wired, cold) {
        const me     = this,
              target = me.getReference('tasks-sections');

        if (!target) return;

        target.removeAll(true);

        target.add(SECTIONS.map(section => {
            const
                sample = cold,
                rows   = sample
                    ? SAMPLE_ROWS.filter(row => row.section === section.id)
                    : wired ? me.taskStore.items.filter(record => record.section === section.id) : [],
                pill   = sample ? 'sample' : wired ? 'live' : 'unavailable',
                items  = [{
                    module: Container,
                    cls   : ['fm-tasks-section-head'],
                    flex  : 'none',
                    layout: {ntype: 'hbox', align: 'center'},
                    items : [{
                        module: Component,
                        cls   : ['fm-tasks-section-label'],
                        flex  : 1,
                        text  : section.label
                    }, {
                        module: Component,
                        cls   : ['fm-freshness', `is-${pill}`],
                        text  : pill
                    }]
                }];

            if (rows.length > 0) {
                items.push(...rows.map(row => me.rowConfig(row, sample)))
            } else {
                items.push({
                    module: Component,
                    cls   : ['fm-tasks-empty'],
                    text  : wired ? section.empty : 'The task sources did not answer. Nothing here claims to be the deployment.'
                })
            }

            return {
                module: Container,
                cls   : ['fm-tasks-section', `is-${section.id}`],
                flex  : 'none',
                layout: {ntype: 'vbox', align: 'stretch'},
                items
            }
        }))
    }

    /**
     * @summary Build one row from a Store record (or a sample row) under the one row grammar:
     * `[time] [name] [state] [progress?] [provenance]`. The time is viewer-local with the exact
     * ISO instant as its title (T5); a determinate run renders a native `progress` element PLUS
     * the percentage as text — the bar is the glance, the text is the 1.4.1 channel; a backlog
     * gauge renders `done / total` and keeps its "backlog" word, because a queue is not a task.
     * @param {Neo.data.Model|Object} row
     * @param {Boolean} sample
     * @returns {Object}
     */
    rowConfig(row, sample) {
        const
            me       = this,
            progress = row.progressKind && Number.isInteger(row.progressDone) && Number.isInteger(row.progressTotal) && row.progressTotal > 0
                ? {kind: row.progressKind, done: Math.min(row.progressDone, row.progressTotal), total: row.progressTotal}
                : null,
            title    = viewerTimeTitle(row.at),
            items    = [{
                module: Component,
                cls   : ['fm-task-time'],
                text  : me.formatStamp(row.at),
                ...(title ? {vdom: {title}} : {})
            }, {
                module: Component,
                cls   : ['fm-task-name'],
                flex  : 1,
                text  : row.name ?? 'Unnamed task',
                ...(row.detail ? {vdom: {title: row.detail}} : {})
            }, {
                module: Component,
                cls   : ['fm-task-state'],
                text  : row.state ?? 'unknown'
            }];

        if (progress) {
            const label = progress.kind === 'determinate'
                ? `${Math.round(progress.done / progress.total * 100)}%`
                : `${progress.done} / ${progress.total}`;

            items.push({
                module: Component,
                cls   : ['fm-task-progress', `is-${progress.kind}`],
                vdom  : {
                    cn: [{
                        tag         : 'progress',
                        cls         : ['fm-task-bar'],
                        value       : progress.done,
                        max         : progress.total,
                        'aria-label': `${row.name ?? 'task'} ${progress.kind === 'backlog' ? 'backlog' : 'progress'}`
                    }, {
                        tag : 'span',
                        cls : ['fm-task-progress-text'],
                        text: label
                    }]
                }
            })
        }

        items.push({
            module: Component,
            cls   : ['fm-freshness', sample ? 'is-sample' : `is-source-${row.source ?? 'unknown'}`],
            text  : sample ? 'sample' : (SOURCE_LABELS[row.source] ?? 'unknown source')
        });

        return {
            module: Container,
            cls   : ['fm-task-row', `is-${row.section ?? 'unknown'}`],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items
        }
    }

    /**
     * @summary Viewer-local rendering of one wire instant, or the honest dash for a row with no
     * governing time (a frozen collection, a queue fact without a cycle).
     * @param {String|null} value
     * @returns {String}
     */
    formatStamp(value) {
        return value ? (formatViewerTime(value)?.text ?? 'unknown time') : '—'
    }
}

export default Neo.setupClass(TasksPane);
