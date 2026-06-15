import DockLayoutAdapter from '../../../src/dashboard/DockLayoutAdapter.mjs';
import DockZoneModel     from '../../../src/dashboard/DockZoneModel.mjs';
import Viewport          from '../../../src/container/Viewport.mjs';
import '../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the projection emits for tab zones

/**
 * A representative dock-zone document (`neo.harness.dockZone.v1`): a horizontal split of a two-tab main zone and a
 * vertical side-split of two single-tab zones, over four items. The shape `Neo.dashboard.DockLayoutAdapter.project`
 * consumes — see its spec for the full contract. Used as the example's INITIAL committed document; the live document
 * advances on each splitter resize (see `MainContainer#dockModel`).
 * @type {Object}
 */
const initialDockModel = {
    schema: 'neo.harness.dockZone.v1',
    root  : 'root',
    items : {
        strategy: {componentRef: 'Strategy', title: 'Strategy', kind: 'panel'},
        swarm   : {componentRef: 'Swarm',    title: 'Swarm',    kind: 'panel'},
        terminal: {componentRef: 'Terminal', title: 'Terminal', kind: 'terminal'},
        logs    : {componentRef: 'Logs',     title: 'Logs',     kind: 'panel'}
    },
    nodes: {
        root           : {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-split'], sizes: [0.65, 0.35]},
        'main-tabs'    : {type: 'tabs',  items: ['strategy', 'swarm'], activeItemId: 'strategy'},
        'side-split'   : {type: 'split', orientation: 'vertical', children: ['terminal-tabs', 'logs-tabs'], sizes: [0.6, 0.4]},
        'terminal-tabs': {type: 'tabs',  items: ['terminal'], activeItemId: 'terminal'},
        'logs-tabs'    : {type: 'tabs',  items: ['logs'],     activeItemId: 'logs'}
    }
};

/**
 * Resolves a model `componentRef` to the component config rendered inside its dock zone. For this example, a simple
 * centered label per panel; a real app resolves each ref to its feature view.
 * @param {String} componentRef
 * @returns {Object}
 */
const resolveComponentRef = componentRef => ({
    ntype: 'component',
    style: {alignItems: 'center', color: '#888', display: 'flex', fontSize: '20px', justifyContent: 'center'},
    html : componentRef
});

/**
 * @summary Standalone, interactive example for the dashboard dock-zone layout system.
 *
 * Builds a representative {@link Neo.dashboard.DockZoneModel} document, projects it through
 * {@link Neo.dashboard.DockLayoutAdapter} into a live container of split / tab zones with splitter affordances, and
 * wires the **resize commit loop** end-to-end: dragging a splitter commits a `resizeSplit` operation through
 * `DockZoneModel`, and the layout re-projects from the new committed document.
 *
 * The example owns the committed document ({@link #dockModel}) as the single source of truth and drives the loop with
 * the two callbacks `DockSplitter` calls — a clean reducer / view-sync split:
 * - {@link #applyDockZoneOperation} is the **reducer**: a pure `DockZoneModel.applyOperation` over the current document.
 * - {@link #onDockZoneDocumentChange} is the **view-sync**: it stores the committed document and re-projects from it.
 *
 * This is the first *runtime* exercise of the full model → operation → re-projection cycle in a standalone app; Slice 1
 * delivered the static render. See `learn/agentos/HarnessDockZoneModel.md` for the model/projection contract.
 * @class Neo.examples.dashboard.dock.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.dock.MainContainer'
         * @protected
         */
        className: 'Neo.examples.dashboard.dock.MainContainer',
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'}
        // `items` is built in construct() — not here — so each projection can carry the instance-bound
        // applyDockZoneOperation + onDockZoneDocumentChange callbacks the resize commit loop needs.
    }

    /**
     * The live committed dock-zone document — the single source of truth the view projects from. Initialized to
     * `initialDockModel`; advanced by {@link #onDockZoneDocumentChange} on each committed splitter resize.
     * @member {Object|null} dockModel=null
     */
    dockModel = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dockModel = initialDockModel;
        me.add(me.projectDockModel())
    }

    /**
     * The owning reducer `DockSplitter.commitResizeSplit` calls: applies a splitter-emitted operation descriptor
     * against the live committed document and returns `DockZoneModel`'s fail-closed `{document, errors}` result.
     * Pure — the view sync happens in {@link #onDockZoneDocumentChange}, which the splitter calls on success.
     * @param {Object} descriptor The `resizeSplit` operation descriptor.
     * @returns {{document: Object, errors: String[]}}
     */
    applyDockZoneOperation(descriptor) {
        return DockZoneModel.applyOperation(this.dockModel, descriptor)
    }

    /**
     * The view-sync `DockSplitter` calls after a successful commit: stores the new committed document and re-projects
     * the layout from it.
     *
     * Deferred one tick: this fires synchronously from inside the committing splitter's `onDragEnd` (via
     * `commitResizeSplit`). Re-projecting immediately would `removeAll()` — destroying that splitter mid-handler, a
     * use-after-destroy on the rest of `onDragEnd`. The `isDestroyed` guard covers teardown before the tick fires.
     * @param {Object} document The committed dock-zone document.
     */
    onDockZoneDocumentChange(document) {
        let me = this;

        me.dockModel = document;

        me.timeout(0).then(() => {
            if (!me.isDestroyed) {
                me.removeAll();
                me.add(me.projectDockModel())
            }
        })
    }

    /**
     * Projects the live committed {@link #dockModel} into a dock-zone container config, threading the instance-bound
     * resize-commit-loop callbacks onto every projected splitter affordance.
     * @returns {Object}
     */
    projectDockModel() {
        let me = this;

        return DockLayoutAdapter.project(me.dockModel, {
            applyDockZoneOperation  : me.applyDockZoneOperation.bind(me),
            onDockZoneDocumentChange: me.onDockZoneDocumentChange.bind(me),
            resolveComponentRef
        })
    }
}

export default Neo.setupClass(MainContainer);
