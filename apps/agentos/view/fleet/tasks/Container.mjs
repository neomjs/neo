import BaseContainer                                  from '../../../../../src/container/Base.mjs';
import Button                                         from '../../../../../src/button/Base.mjs';
import FleetTasks                                     from '../../../store/FleetTasks.mjs';
import TasksController                                from './Controller.mjs';
import TasksList, {SOURCE_LABELS, SOURCE_STATE_WORDS} from './List.mjs';
import ViewerTime                                     from '../../../util/ViewerTime.mjs';

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
 * recently completed work — beside the roster that says WHO.
 *
 * @summary Projects one viewer-bound `fleetTasks` envelope into the bound Store as the exact
 * record set the {@link AgentOS.view.fleet.tasks.List tasks list} renders — section headers
 * (`isHeader`, the `useHeaders` contract), task rows, honest empty lines — without synthesizing,
 * ranking, or caching the envelope. The surface owns only this local projection Store plus the
 * honest chrome (meta line, refresh intent); its {@link AgentOS.view.fleet.tasks.Controller
 * controller} fires the read intent, and the owning FleetCockpit holds the authenticated bridge
 * and drives the read at boot and on every liveness tick.
 *
 * Honest states are first-class: the cold spine renders sample-labeled rows (shape, not claim),
 * an unavailable read names its reason, a wired read with an empty section says so in words, a
 * run with no reported fraction carries its state word instead of a bar that would lie, and a
 * backlog gauge is labeled as a queue — never as progress.
 *
 * @class AgentOS.view.fleet.tasks.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.tasks.Container'
         * @protected
         */
        className: 'AgentOS.view.fleet.tasks.Container',
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
         * @member {Neo.controller.Component} controller=TasksController
         * @reactive
         */
        controller: TasksController,
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
            module   : TasksList,
            flex     : 1,
            reference: 'tasks-list'
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
                handler  : 'onRefreshClick'
            }]
        }]
    }

    /** @member {AgentOS.store.FleetTasks|null} taskStore=null */
    taskStore = null

    /**
     * @summary Create the pane-local projection Store, seat it on the list, and render held owner
     * state. No read fires here: the cockpit drives the tasks read at boot and on its liveness
     * tick, so a resident tab constructs on the owner-held snapshot and never queries the plane
     * on its own.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        let me = this;

        me.taskStore = Neo.create(FleetTasks);
        me.getReference('tasks-list').store = me.taskStore;
        me.applySnapshot()
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

    /**
     * @summary Project the latest envelope into the Store as the full render set — one header
     * record per section under its freshness pill, then that section's rows (sample on the cold
     * spine, the mapped envelope rows on a wired read, the honest empty line otherwise). A
     * replace is wholesale — rows are a glance at one instant, never an accumulation — and the
     * meta line names every source axis by its own state word, so a partial read is readable as
     * exactly that.
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

        const
            pill      = cold ? 'sample' : wired ? 'live' : 'unavailable',
            wiredRows = wired
                ? ['running', 'queued', 'recent']
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
                    }))
                : [],
            records   = SECTIONS.flatMap(section => {
                const rows = cold
                    ? SAMPLE_ROWS.filter(row => row.section === section.id).map(row => ({...row, sample: true}))
                    : wiredRows.filter(row => row.section === section.id);

                return [
                    {id: `header:${section.id}`, isHeader: true, rowKind: 'header', section: section.id, label: section.label, pill},
                    ...(rows.length > 0 ? rows : [{
                        id     : `empty:${section.id}`,
                        rowKind: 'empty',
                        section: section.id,
                        label  : wired ? section.empty : 'The task sources did not answer. Nothing here claims to be the deployment.'
                    }])
                ]
            });

        me.taskStore.clear();
        me.taskStore.add(records);

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
            metaEl.changeVdomRootKey('title', wired ? ViewerTime.viewerTimeTitle(snapshot.capability.capturedAt) : null)
        }
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
     * @summary Viewer-local rendering of the envelope's capture instant for the meta line.
     * @param {String|null} value
     * @returns {String}
     */
    formatStamp(value) {
        return value ? (ViewerTime.formatViewerTime(value)?.text ?? 'unknown time') : '—'
    }
}

export default Neo.setupClass(Container);
