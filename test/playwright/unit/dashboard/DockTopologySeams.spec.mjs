import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockTopologySeamsTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import '../../../../src/tab/Container.mjs';    // registers the `tab-container` ntype the projection emits
import DockWorkspace            from '../../../../src/dashboard/dock/Workspace.mjs';
import Persistence              from '../../../../src/dashboard/dock/model/Persistence.mjs';
import TopologyReconciler       from '../../../../src/dashboard/dock/model/TopologyReconciler.mjs';
import {createDockWorkspaceSet} from '../../../../src/dashboard/dock/window/WorkspaceSet.mjs';

/**
 * @summary The holder seam pair a multi-window perspective restore reaches an app through.
 *
 * `DockService` refuses a topology record unless the holder answers BOTH seams, and it resolves the
 * holder as the component carrying the dock document — so these have to be real methods on a real
 * workspace. Before this pair existed the whole capture/restore chain was exercised only against
 * stub objects in `DockService`'s own spec, which is why an unreachable capability stayed green.
 *
 * The round-trip below therefore runs the REAL capture producer, the REAL topology reconciler and a
 * REAL workspace + workspace set — nothing about the restore path is mocked.
 */

/** Primary-window fixture. */
function primaryDoc() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {
            strategy: {componentRef: 'strategy', title: 'Strategy', kind: 'panel'},
            swarm   : {componentRef: 'swarm',    title: 'Swarm',    kind: 'panel'}
        },
        nodes: {
            root       : {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}}},
            'main-tabs': {type: 'tabs', items: ['strategy', 'swarm'], activeItemId: 'strategy'}
        }
    }
}

/** Item-disjoint second-window fixture — the reconciler validates disjointness across windows. */
function vesselDoc() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {terminal: {componentRef: 'terminal', title: 'Terminal', kind: 'terminal'}},
        nodes : {
            root         : {type: 'edge-zone', zones: {center: {nodeId: 'vessel-tabs'}}},
            'vessel-tabs': {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
        }
    }
}

/** The primary, rearranged — a different composition to restore AWAY from. */
function primaryRearranged() {
    const document = primaryDoc();

    document.nodes['main-tabs'].items        = ['swarm', 'strategy'];
    document.nodes['main-tabs'].activeItemId = 'swarm';

    return document
}

/**
 * A workspace that has actually projected: the commit seam ends in the view-sync contract, and an
 * unprojected shell would exercise the seams without ever exercising that.
 */
class TopologyWorkspace extends DockWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockTopologySeams.Workspace',
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }
}

Neo.setupClass(TopologyWorkspace);

test.describe('Neo.dashboard.dock.window.TopologySeams — the multi-window restore seams', () => {
    let workspace;

    test.afterEach(() => {
        workspace?.isDestroyed === false && workspace.destroy();
        workspace = null
    });

    /**
     * Registers the primary first, exactly as a host does — `ids()` order IS slot order, and the
     * capture/restore pair index by it.
     * @returns {Object} `{set, vessel}` — the live set plus a mutable second-slot handle
     */
    function createSet(host) {
        const
            vessel = {document: vesselDoc()},
            set    = createDockWorkspaceSet();

        set.register('main', {
            getDocument: () => host.dockModel,
            setDocument: document => host.dockModel = document
        });

        set.register('vessel', {
            getDocument: () => vessel.document,
            setDocument: document => vessel.document = document
        });

        return {set, vessel}
    }

    test('a workspace with no set answers a single-slot topology', () => {
        workspace = Neo.create(TopologyWorkspace, {dockModel: primaryDoc()});

        const documents = workspace.getDockTopologyDocuments();

        expect(documents).toHaveLength(1);
        expect(documents[0]).toBe(workspace.dockModel)
    });

    test('a workspace with a set answers every slot, primary first', () => {
        workspace = Neo.create(TopologyWorkspace, {dockModel: primaryDoc()});

        const {set, vessel} = createSet(workspace);

        workspace.workspaceSet = set;

        const documents = workspace.getDockTopologyDocuments();

        expect(documents).toHaveLength(2);
        expect(documents[0]).toBe(workspace.dockModel);
        expect(documents[1]).toBe(vessel.document)
    });

    test('a multi-window capture restores the whole composition through the real reconciler', async () => {
        workspace = Neo.create(TopologyWorkspace, {dockModel: primaryDoc()});

        const {set, vessel} = createSet(workspace);

        workspace.workspaceSet = set;

        // CAPTURE the composition through the seam the service uses
        const captured = Persistence.captureTopologyPerspective(workspace.getDockTopologyDocuments(), {
            layoutId: 'topo-1', perspectiveName: 'Everything', title: 'Everything'
        });

        expect(captured.errors).toEqual([]);
        expect(captured.layout.captureScope).toBe('topology');
        // where the active tab lives at each hop — capture, reconcile, commit
        expect(captured.layout.dockZone.nodes['main-tabs'].activeItemId, 'capture keeps it').toBe('strategy');

        // the live composition MOVES ON: the primary is rearranged
        workspace.dockModel = primaryRearranged();

        expect(workspace.dockModel.nodes['main-tabs'].items).toEqual(['swarm', 'strategy']);

        // RESTORE: real reconciler over the live slots, then the atomic write seam
        const result = TopologyReconciler.reconcile(captured.layout, workspace.getDockTopologyDocuments());

        expect(result.errors).toEqual([]);
        expect(result.documents).toHaveLength(2);
        // KNOWN GAP, pinned rather than wished away: capture keeps `activeItemId` (asserted above)
        // and the reconciler leaves the LIVE value standing — the string appears nowhere in
        // `TopologyReconciler` or `RestorePlanner`. Tab membership and order restore; which tab was
        // active does not. Flagged separately; this arm exists so the gap cannot close silently.
        expect(result.documents[0].nodes['main-tabs'].activeItemId, 'live value survives today').toBe('swarm');

        const commit = workspace.commitDockTopologyDocuments(result.documents, {operation: 'restorePerspective'});

        expect(commit.errors).toEqual([]);

        // the captured composition is back on BOTH slots
        expect(workspace.dockModel.nodes['main-tabs'].items).toEqual(['strategy', 'swarm']);
        expect(Object.keys(vessel.document.items)).toEqual(['terminal']);

        await workspace.refreshPromise
    });

    test('a commit refuses rather than dropping slots it cannot hold', () => {
        workspace = Neo.create(TopologyWorkspace, {dockModel: primaryDoc()});

        // no set: a single-document workspace must never silently swallow a two-window record
        const refused = workspace.commitDockTopologyDocuments([primaryDoc(), vesselDoc()]);

        expect(refused.errors).toHaveLength(1);
        expect(refused.errors[0]).toContain('commits every slot or none');

        expect(workspace.commitDockTopologyDocuments([]).errors).toHaveLength(1);
        expect(workspace.commitDockTopologyDocuments([null]).errors).toHaveLength(1);
        expect(workspace.commitDockTopologyDocuments(null).errors).toHaveLength(1)
    })
});
