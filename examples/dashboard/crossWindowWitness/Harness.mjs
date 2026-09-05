import Component from '../../../src/component/Base.mjs';
import Neo       from '../../../src/Neo.mjs';
import Viewport  from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.dashboard.crossWindowWitness.Harness
 * @extends Neo.container.Viewport
 *
 * @summary Cross-window drag safety verification harness — verification-only, not a product demo.
 *
 * The dock product example is single-workspace, so it cannot produce the two-window cross-window
 * safety witness. This harness composes the exact `DockCrossWindowParticipation` cross-window scenario
 * (a registered remote target + a real `DockTabSortZone` source in the same `sortGroup`, the REAL
 * `DragCoordinator` + executor) that the unit spec drives in Node — but here it runs in a REAL
 * browser App-Worker, and it runs the FIRST gesture COLD: the source zone is created and dragged
 * without ever awaiting `resolveDragCoordinator`, so the drop depends entirely on `construct()`'s
 * off-hot-path preload having warmed `dragCoordinator` before the release. It stamps the outcome
 * (`transferCount` / `dropFires` / `remoteDropCommitted` / `coordinatorWarmed` / `pass`) onto the
 * `#witness-result` DOM node as data-attributes for an e2e to read via `page.evaluate` — the L3 receipt.
 */
class Harness extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.crossWindowWitness.Harness'
         * @protected
         */
        className: 'Neo.examples.dashboard.crossWindowWitness.Harness',
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Component,
            id       : 'witness-result',
            reference: 'result',
            vdom     : {'data-status': 'running', style: {font: '16px monospace', padding: '20px', whiteSpace: 'pre-wrap'}, text: 'running the #15065 cross-window witness…'}
        }]
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.runWitness().catch(error => this.report({pass: false, error: error?.message || String(error), stack: error?.stack}))
    }

    /**
     * Stamps the witness outcome onto the `#witness-result` DOM node as data-attributes an e2e reads.
     * @param {Object} results
     */
    report(results) {
        let el = this.getReference('result');

        // top-level property so an e2e reads it via the Neural Link (`findInstances`) without
        // depending on the mainView being mounted
        this.witnessResult = results;

        el.vdom['data-status']             = 'done';
        el.vdom['data-pass']               = String(results.pass === true);
        el.vdom['data-transfer-count']     = String(results.transferCount ?? '');
        el.vdom['data-drop-fires']         = String(results.dropFires ?? '');
        el.vdom['data-remote-committed']   = String(results.remoteDropCommitted ?? '');
        el.vdom['data-coordinator-warmed'] = String(results.coordinatorWarmed ?? '');
        el.vdom['data-foreign-previews']   = String(results.foreignPreviews ?? '');
        el.vdom['data-foreign-transfers']  = String(results.foreignTransfers ?? '');
        el.vdom['data-foreign-proxy-hidden'] = String(results.foreignProxyHidden ?? '');
        el.vdom['data-foreign-docs-intact']  = String(results.foreignDocsIntact ?? '');
        el.vdom.text                       = JSON.stringify(results, null, 2);
        el.update()
    }

    /**
     * Runs the cross-window transfer COLD (no `resolveDragCoordinator` await) and reports the result.
     */
    async runWitness() {
        let me              = this,
            Rectangle       = (await import('../../../src/util/Rectangle.mjs')).default,
            WindowManager   = (await import('../../../src/manager/Window.mjs')).default,
            Participation   = (await import('../../../src/dashboard/dock/window/Participation.mjs')).default,
            DockTabSortZone = (await import('../../../src/dashboard/dock/interaction/TabSortZone.mjs')).default;

        const sourceDoc = () => ({
            schema: 'neo.dock.zone.v1', root: 'root',
            items : {strategy: {componentRef: 'strategy', title: 'Strategy', kind: 'panel'}, terminal: {componentRef: 'terminal', title: 'Terminal', kind: 'terminal'}},
            nodes : {root: {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}, right: {nodeId: 'side-tabs'}}}, 'main-tabs': {type: 'tabs', items: ['strategy'], activeItemId: 'strategy'}, 'side-tabs': {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}}
        });
        const targetDoc = () => ({
            schema: 'neo.dock.zone.v1', root: 'root',
            items : {alpha: {componentRef: 'alpha', title: 'Alpha', kind: 'panel'}},
            nodes : {root: {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}}}, 'main-tabs': {type: 'tabs', items: ['alpha'], activeItemId: 'alpha'}}
        });

        const transfers = [], fires = [];

        WindowManager.register({id: 'cw-win-a', innerRect: new Rectangle(0, 0, 800, 600),    outerRect: new Rectangle(0, 0, 800, 600)});
        WindowManager.register({id: 'cw-win-b', innerRect: new Rectangle(1000, 0, 800, 600), outerRect: new Rectangle(1000, 0, 800, 600)});

        // registered remote target in window B — no dragCoordinator injected → the REAL singleton
        const participation = Neo.create(Participation, {
            commitLocal       : () => { throw new Error('a remote drop must never ride the local seam') },
            commitTransfer    : published => transfers.push(published),
            getDocument       : () => targetDoc(),
            getForeignDocument: workspaceId => workspaceId === 'A' ? sourceDoc() : null,
            hitTest           : () => true,
            previewFor        : payload => ({itemId: payload.draggedItem.dockItemId, placement: {kind: 'tab-into'}}),
            previewToOperation: preview => ({operation: 'addTab', itemId: preview.itemId, tabsNodeId: 'main-tabs'}),
            resolveOwnershipId: () => 'cw-group',
            sortGroup         : 'cw-witness',
            windowId          : 'cw-win-b',
            workspaceId       : 'B'
        });

        // window A's own registered surface: the source zone below drags under ITS ownership (docking design record §2.3),
        // exactly as a dock window's header drags under the participation its workspace registered
        const sourceParticipation = Neo.create(Participation, {
            getDocument       : () => sourceDoc(),
            resolveOwnershipId: () => 'cw-group',
            sortGroup         : 'cw-witness',
            windowId          : 'cw-win-a',
            workspaceId       : 'A'
        });

        // A SECOND root on the same heap, with the same bare workspace ids 'A' and 'B' but its own commit
        // authority. Its windows sit below root A's; the gesture crosses its popup before it reaches the
        // real target, and nothing here may preview, stage or commit (docking design record §2.3).
        const
            foreign     = {previews: 0, transfers: 0, localCommits: 0},
            foreignDocs = {A: sourceDoc(), B: targetDoc()},
            foreignSnap = JSON.stringify(foreignDocs);

        WindowManager.register({id: 'cw-root-b-main',  innerRect: new Rectangle(0, 700, 800, 600),    outerRect: new Rectangle(0, 700, 800, 600)});
        WindowManager.register({id: 'cw-root-b-popup', innerRect: new Rectangle(1000, 700, 800, 600), outerRect: new Rectangle(1000, 700, 800, 600)});

        const foreignParticipations = [['A', 'cw-root-b-main'], ['B', 'cw-root-b-popup']].map(([workspaceId, windowId]) => Neo.create(Participation, {
            commitLocal       : () => { foreign.localCommits++; return null },
            commitTransfer    : () => { foreign.transfers++; return true },
            getDocument       : () => foreignDocs[workspaceId],
            getForeignDocument: id => foreignDocs[id] ?? null,
            hitTest           : () => true,
            previewFor        : payload => { foreign.previews++; return {itemId: payload.draggedItem.dockItemId, placement: {kind: 'tab-into'}} },
            previewToOperation: preview => ({operation: 'addTab', itemId: preview.itemId, tabsNodeId: 'main-tabs'}),
            resolveOwnershipId: () => 'cw-group-b',
            sortGroup         : 'cw-witness',
            windowId,
            workspaceId
        }));

        // COLD source zone in window A — construct() kicks off the coordinator preload; we NEVER await it
        const zone = Neo.create(DockTabSortZone, {
            dockItemIds     : ['terminal'],
            dockSourceNodeId: 'side-tabs',
            dockWorkspaceId : 'A',
            owner           : {addDomListeners: () => {}, cls: [], dragResortable: false, items: [], on: () => {}, style: {}, up: () => ({fire: (name, data) => fires.push([name, data])})},
            sortGroup       : 'cw-witness',
            windowId        : 'cw-win-a'
        });

        zone.dragComponent = {id: 'tab-proxy', dockItemId: 'terminal', dockSourceOwnershipId: 'cw-group', dockSourceWorkspaceId: 'A'};
        zone.dragProxy     = {hidden: false};
        zone.startIndex    = 0;

        // one realistic frame gap models projection→gesture; the preload must have warmed by now,
        // purely via construct() — NOT via an explicit resolveDragCoordinator await
        await me.timeout(32);

        // ONE gesture: first over the other root's popup (same bare id 'B', another authority — must
        // preview nothing and hide no proxy), then over root A's own target, where it commits once.
        await zone.onDragMove({clientX: 60, clientY: 20, offsetX: 8, offsetY: 8, proxyRect: {width: 120, height: 32}, screenX: 1400, screenY: 1000});

        const foreignProxyHidden = zone.dragProxy.hidden === true;

        await zone.onDragMove({clientX: 60, clientY: 20, offsetX: 8, offsetY: 8, proxyRect: {width: 120, height: 32}, screenX: 1400, screenY: 300});
        await zone.processDragEnd({clientX: 60, clientY: 20});

        const dropFires         = fires.filter(([name]) => name === 'dockCrossZoneDrop').length,
              foreignDocsIntact = JSON.stringify(foreignDocs) === foreignSnap,
              foreignUntouched  = foreign.previews === 0 && foreign.transfers === 0 && foreign.localCommits === 0 && !foreignProxyHidden && foreignDocsIntact,
              results           = {
                  transferCount      : transfers.length,
                  dropFires,
                  remoteDropCommitted: zone.remoteDropCommitted,
                  coordinatorWarmed  : !!zone.dragCoordinator,
                  foreignPreviews    : foreign.previews,
                  foreignTransfers   : foreign.transfers + foreign.localCommits,
                  foreignProxyHidden,
                  foreignDocsIntact,
                  pass               : transfers.length === 1 && dropFires === 0 && zone.remoteDropCommitted === false && !!zone.dragCoordinator && foreignUntouched
              };

        participation.destroy();
        sourceParticipation.destroy();
        foreignParticipations.forEach(foreignParticipation => foreignParticipation.destroy());
        WindowManager.unregister(WindowManager.get('cw-root-b-main'));
        WindowManager.unregister(WindowManager.get('cw-root-b-popup'));
        zone.destroy();
        WindowManager.unregister(WindowManager.get('cw-win-a'));
        WindowManager.unregister(WindowManager.get('cw-win-b'));

        me.report(results)
    }
}

export default Neo.setupClass(Harness);
