import Container      from '../../../../../src/container/Base.mjs';
import DockPreview    from '../../../../../src/dashboard/dock/interaction/Preview.mjs';
import DockWorkspace  from '../../../../../src/dashboard/dock/Workspace.mjs';
import DropIndicators from '../../../../../src/dashboard/dock/interaction/DropIndicators.mjs';
import Viewport       from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

/**
 * @summary The BARE consumer: a dock host that declares nothing but `position: relative`.
 *
 * Every shipping consumer of the dock either carries an app stylesheet or copied one, so none of
 * them can witness what the engine owes a host that carries neither. This fixture deliberately has
 * no stylesheet at all — the host's only contract is the positioning context, which is what a
 * downstream app supplies when it reads the docs and stops there.
 *
 * The projection is child 0 and the two overlays are PERSISTENT siblings, mirroring the shape both
 * the Workstation and Demo-A give their host: object permanence across every re-projection.
 */
const fixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        main : {componentRef: 'main',  title: 'Main',  kind: 'panel'},
        aside: {componentRef: 'aside', title: 'Aside', kind: 'panel'}
    },
    nodes: {
        root        : {type: 'tabs', items: ['main', 'aside'], activeItemId: 'main'}
    }
};

class PreviewGeometryWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockPreviewGeometry.Workspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockPreviewGeometry.Workspace',
        /**
         * @member {String[]} cls=['dock-preview-geometry-workspace']
         */
        cls: ['dock-preview-geometry-workspace'],
        /**
         * The projection mounts into this child, and the overlays sit beside it.
         * @member {String} dockHostReference='dock-host'
         */
        dockHostReference: 'dock-host',
        /**
         * @member {String} id='dock-preview-geometry-workspace'
         */
        id: 'dock-preview-geometry-workspace',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * How many dock projections have RUN TO COMPLETION on this workspace.
     *
     * The spec's settle guard used to poll the host's child count for its at-rest value of 3 — but 3
     * is the at-rest count on BOTH sides of a projection, so `expect.poll` returned on its first
     * satisfying sample and could hand control to a measurement that then landed mid-stage. It waited
     * for a state the timeline visits twice instead of the transition it meant to witness.
     *
     * This counter cannot be satisfied before a projection has run: it starts at 0.
     * @member {Number} dockProjectionSettles=0
     */
    dockProjectionSettles = 0
    /**
     * Whether a projection is in flight right now.
     *
     * The counter alone is not enough — two equal samples can bracket a refresh that started after
     * the first and has not finished by the second. Pairing them gives the guard a state that exists
     * only after a projection has completed AND while none is running.
     * @member {Boolean} dockProjectionBusy=false
     */
    dockProjectionBusy = false

    /**
     * @param {Object} data
     */
    afterRefreshDockWorkspace(data) {
        super.afterRefreshDockWorkspace(data);
        this.dockProjectionSettles++
    }

    /**
     * Brackets the whole refresh, so `dockProjectionBusy` cannot LATCH.
     *
     * The obvious shape — set it in `beforeRefreshDockWorkspace`, clear it in
     * `afterRefreshDockWorkspace` — latches on every path between the two that does not reach the
     * second hook, and this subsystem has several: `refreshDockWorkspace` returns early on the
     * projection-failure path (deliberately, since `afterRefreshDockWorkspace` consumers read
     * `result` as a completed projection), it returns early when the workspace is destroyed, and an
     * uncaught throw inside the transaction leaves the pair unbalanced too. Measured: the paired
     * version stayed `true` for the life of the workspace, and the settle guard would then have
     * timed out at 10 s with a poll message rather than a failure — reintroducing, one layer up,
     * exactly the ambiguity this fixture removes.
     *
     * `finally` closes the whole class at once instead of naming each exit. `dockProjectionSettles`
     * still counts only true completions, because that is a different question: *did a projection
     * finish*, versus *is one running*.
     * @param {Object} tabInsertDescriptor
     * @param {Object} document
     * @param {Object} refreshOptions
     * @returns {Promise<*>}
     */
    async refreshDockWorkspace(tabInsertDescriptor, document, refreshOptions) {
        let me = this;

        me.dockProjectionBusy = true;

        try {
            return await super.refreshDockWorkspace(tabInsertDescriptor, document, refreshOptions)
        } finally {
            me.dockProjectionBusy = false
        }
    }

    /**
     * Builds the host and its two persistent overlay siblings. The host gets `position: relative`
     * through an inline style rather than a class, so this fixture stays stylesheet-free and the
     * spec measures the engine sheet alone.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.add({
            cls  : ['dock-preview-geometry-host', 'neo-dashboard', 'neo-dashboard-dock-query-host'],
            flex : 1,
            items: [me.projectDockModel(), {
                module   : DockPreview,
                reference: 'dock-preview'
            }, {
                module   : DropIndicators,
                reference: 'drop-indicators'
            }],
            layout   : {ntype: 'fit'},
            module   : Container,
            reference: 'dock-host',
            style    : {position: 'relative'}
        });

        me.onDockZoneDocumentChange(structuredClone(fixtureDocument))
    }

    /**
     * @summary Resolves one test pane. The panes carry no geometry of their own — the assertions
     * read the host and the preview, never the pane.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        return {
            cls  : ['dock-preview-geometry-pane', `dock-preview-geometry-pane-${itemId}`],
            id   : `dock-preview-geometry-pane-${itemId}`,
            ntype: 'component',
            vdom : {cn: [{tag: 'span', text: `${item?.title || itemId} pane`}]}
        }
    }
}

PreviewGeometryWorkspace = Neo.setupClass(PreviewGeometryWorkspace);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: PreviewGeometryWorkspace, flex: 1}]
    },
    name: 'Test.Playwright.DockPreviewGeometry'
});
