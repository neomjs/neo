import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockCrossWindowParticipationTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * @summary Tests for Neo.dashboard.dock.window.Participation — the adapter-tier composition
 * that wires ONE dock workspace into the §2.3 cross-window contract over landed machinery only:
 * target registration lifecycle, the owner seams, foreign-vs-local drop discrimination, the
 * atomic `transferItem` composition, and finite-schema publication of the executor's document
 * pair. The executor itself is the REAL DockZoneModel — no transfer semantics are mocked.
 */

/** A fresh source-workspace document ('A') — `terminal` is the item every transfer moves. */
function sourceDoc() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {
            strategy: {componentRef: 'strategy', title: 'Strategy', kind: 'panel'},
            terminal: {componentRef: 'terminal', title: 'Terminal', kind: 'terminal'}
        },
        nodes: {
            root       : {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}, right: {nodeId: 'side-tabs'}}},
            'main-tabs': {type: 'tabs', items: ['strategy'], activeItemId: 'strategy'},
            'side-tabs': {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
        }
    }
}

/** A fresh target-workspace document ('B') with a disjoint catalog. */
function targetDoc() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {alpha: {componentRef: 'alpha', title: 'Alpha', kind: 'panel'}},
        nodes : {
            root       : {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}}},
            'main-tabs': {type: 'tabs', items: ['alpha'], activeItemId: 'alpha'}
        }
    }
}

test.describe('Neo.dashboard.dock.window.Participation (ADR 0029 §2.3 — workspace wiring)', () => {
    let DockCrossWindowParticipation, DockTabSortZone, WorkspaceDocument, DragCoordinator, Persistence, Rectangle, WindowManager;

    const createCoordinatorStub = calls => ({
        register  : zone => calls.push(['register', zone]),
        unregister: zone => calls.push(['unregister', zone])
    });

    test.beforeAll(async () => {
        DockCrossWindowParticipation = (await import('../../../../src/dashboard/dock/window/Participation.mjs')).default;
        DockTabSortZone              = (await import('../../../../src/dashboard/dock/interaction/TabSortZone.mjs')).default;
        WorkspaceDocument                     = (await import('../../../../src/dashboard/dock/model/WorkspaceDocument.mjs')).default;
        Persistence                  = (await import('../../../../src/dashboard/dock/model/Persistence.mjs')).default;
        DragCoordinator              = (await import('../../../../src/manager/DragCoordinator.mjs')).default;
        Rectangle                    = (await import('../../../../src/util/Rectangle.mjs')).default;
        WindowManager                = (await import('../../../../src/manager/Window.mjs')).default
    });

    test('registration lifecycle: mount registers ONE identity-complete target, unmount unregisters the same instance', () => {
        const calls = [];

        const participation = Neo.create(DockCrossWindowParticipation, {
            dragCoordinator: createCoordinatorStub(calls),
            getDocument    : () => targetDoc(),
            hitTest        : () => true,
            sortGroup      : 'dock-demo',
            windowId       : 'window-b',
            workspaceId    : 'B'
        });

        expect(calls).toHaveLength(1);

        const [action, zone] = calls[0];

        expect(action).toBe('register');
        expect(zone).toBe(participation.target);
        expect(zone.sortGroup).toBe('dock-demo');
        expect(zone.windowId).toBe('window-b');
        // the §2.3 mandatory target hooks all exist on the registered instance
        for (const hook of ['acceptsRemoteDrag', 'onRemoteDragMove', 'onRemoteDragLeave', 'onRemoteDrop']) {
            expect(typeof zone[hook]).toBe('function')
        }

        participation.destroy();

        expect(calls).toHaveLength(2);
        expect(calls[1]).toEqual(['unregister', zone]);
        // Base.destroy() deletes own members — the owned target reference is gone either way
        expect(participation.target ?? null).toBeNull()
    });

    test('native-titlebar source seams ride the SAME stable participation registration', async () => {
        const
            calls           = [],
            draggedItem     = {id: 'terminal'},
            awaitEmbodiment = payload => {
                calls.push(['await-embodiment', payload]);
                return true
            },
            source      = {
                draggedItem,
                embodyNativeHover: true,
                sourceWindowId   : 'window-popup',
                widgetName       : 'terminal'
            };

        const participation = Neo.create(DockCrossWindowParticipation, {
            awaitDragEmbodiment    : awaitEmbodiment,
            dragCoordinator        : createCoordinatorStub(calls),
            getDocument            : () => targetDoc(),
            resolveNativeWindowDrag: windowId => windowId === 'window-popup' ? source : null,
            resumeNativeWindowDrag : (widgetName, proxyRect) => {
                calls.push(['resume', widgetName, proxyRect]);
                return 'resumed'
            },
            retireNativeWindowDrag : item => {
                calls.push(['retire', item]);
                return 'retired'
            },
            sortGroup              : 'dock-demo',
            suspendNativeWindowDrag: (widgetName, context) => {
                calls.push(['suspend', widgetName, context]);
                return true
            },
            windowId   : 'window-main',
            workspaceId: 'main'
        });

        const target = participation.target;

        expect(calls.filter(([name]) => name === 'register')).toEqual([['register', target]]);
        expect(target.awaitDragEmbodiment).toBe(awaitEmbodiment);
        expect(target.getNativeWindowDrag('window-popup')).toBe(source);
        expect(target.getNativeWindowDrag('window-other')).toBeNull();

        const context = {targetWindowId: 'window-main'};

        expect(target.suspendWindowDrag('terminal', context)).toBe(true);
        expect(target.resumeWindowDrag('terminal', {x: 10, y: 20})).toBe('resumed');
        expect(target.onRemoteDropOut(draggedItem)).toBe('retired');
        expect(calls.slice(1)).toEqual([
            ['suspend', 'terminal', context],
            ['resume', 'terminal', {x: 10, y: 20}],
            ['retire', draggedItem]
        ]);

        participation.destroy();

        expect(calls.filter(([name]) => name === 'unregister')).toEqual([['unregister', target]])
    });

    test('seam binding: the registered target rides the owner preview pipeline — previewFor on hover, previewToOperation + commit on drop', () => {
        const seen  = {previews: [], conversions: [], commits: []};
        const calls = [];

        const participation = Neo.create(DockCrossWindowParticipation, {
            commitLocal       : operation => { seen.commits.push(operation); return {document: targetDoc(), errors: []} },
            dragCoordinator   : createCoordinatorStub(calls),
            getDocument       : () => targetDoc(),
            hitTest           : () => true,
            previewFor        : payload => { seen.previews.push(payload); return {itemId: payload.draggedItem.dockItemId, placement: {kind: 'tab-into'}} },
            previewToOperation: preview => { seen.conversions.push(preview); return {operation: 'addTab', itemId: preview.itemId, tabsNodeId: 'main-tabs'} },
            resolveOwnershipId: () => 'group-1',
            sortGroup         : 'dock-demo',
            windowId          : 'window-b',
            workspaceId       : 'B'
        });

        const draggedItem = {dockItemId: 'alpha', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'B'};
        const payload     = {draggedItem, localX: 10, localY: 10, offsetX: 0, offsetY: 0, proxyRect: null};

        // hover computes through the owner's landed path and the drop converts THAT preview
        const preview = participation.target.onRemoteDragMove(payload);

        expect(seen.previews).toEqual([payload]);
        expect(preview.itemId).toBe('alpha');

        participation.target.onRemoteDrop(draggedItem);

        expect(seen.conversions).toEqual([preview]);
        // the payload NAMES this workspace ('B') as its source → the LOCAL seam committed it
        expect(seen.commits).toEqual([{operation: 'addTab', itemId: 'alpha', tabsNodeId: 'main-tabs'}]);

        participation.destroy()
    });

    test('foreign drop: composes ONE transferItem through the real executor — source loses the item, target gains it, commitTransfer publishes the pair', () => {
        const transfers = [];
        const source    = sourceDoc();

        const participation = Neo.create(DockCrossWindowParticipation, {
            commitLocal       : () => { throw new Error('a foreign drop must never ride the local seam') },
            commitTransfer    : published => transfers.push(published),
            dragCoordinator   : createCoordinatorStub([]),
            getDocument       : () => targetDoc(),
            getForeignDocument: workspaceId => workspaceId === 'A' ? source : null,
            resolveOwnershipId: () => 'group-1',
            sortGroup         : 'dock-demo',
            windowId          : 'window-b',
            workspaceId       : 'B'
        });

        const result = participation.commitDrop(
            {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs'},
            {dockItemId: 'terminal', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'A'}
        );

        expect(result).not.toBeNull();
        expect(transfers).toHaveLength(1);

        const {descriptor, sourceDocument, sourceWorkspaceId, targetDocument, targetWorkspaceId} = transfers[0];

        expect(sourceWorkspaceId).toBe('A');
        expect(targetWorkspaceId).toBe('B');
        expect(descriptor).toMatchObject({operation: 'transferItem', itemId: 'terminal', sourceWorkspaceId: 'A', targetWorkspaceId: 'B'});
        expect(descriptor.target).toEqual({operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs'});

        // atomic two-document truth from the REAL executor: the source lost tree + catalog
        // entry — and `normalizeTree` collapsed the emptied `side-tabs` slot entirely (the §2.3
        // invariant-restoring commit) — while the target gained the verbatim record in place
        expect(sourceDocument.items.terminal).toBeUndefined();
        expect(sourceDocument.nodes['side-tabs']).toBeUndefined();
        expect(targetDocument.nodes['main-tabs'].items).toContain('terminal');
        expect(targetDocument.items.terminal).toMatchObject({componentRef: 'terminal', title: 'Terminal', kind: 'terminal'});

        participation.destroy()
    });

    test('whole-stack drop: only the source model-resolved stack root transfers and publication gates source retirement', () => {
        const source    = sourceDoc();
        const target    = targetDoc();
        const transfers = [];

        target.nodes['target-tabs'] = target.nodes['main-tabs'];
        target.nodes.root.zones.center.nodeId = 'target-tabs';
        delete target.nodes['main-tabs'];

        const create = commitTransfer => Neo.create(DockCrossWindowParticipation, {
            commitTransfer,
            dragCoordinator   : createCoordinatorStub([]),
            getDocument       : () => target,
            getForeignDocument: workspaceId => workspaceId === 'A' ? source : null,
            resolveOwnershipId: () => 'group-1',
            sortGroup         : 'dock-demo',
            windowId          : 'window-b',
            workspaceId       : 'B'
        });
        const operation = {
            operation: 'transferNode',
            nodeId   : 'main-tabs',
            target   : {targetNodeId: 'target-tabs', placement: {kind: 'tab-into'}}
        };
        const drag     = {dockGroupNodeId: 'main-tabs', dockItemId: 'strategy', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'A'};
        const accepted = create(pair => transfers.push(pair));
        const result   = accepted.commitDrop(operation, drag);

        expect(result).not.toBeNull();
        expect(transfers).toHaveLength(1);
        expect(transfers[0].descriptor).toEqual({
            ...operation,
            sourceWorkspaceId: 'A',
            targetWorkspaceId: 'B'
        });
        expect(transfers[0].sourceDocument.items.strategy).toBeUndefined();
        expect(transfers[0].targetDocument.nodes['target-tabs'].items).toEqual(['alpha', 'strategy']);

        const mismatch = create(() => { throw new Error('a non-root group must never publish') });

        expect(mismatch.commitDrop(
            {...operation, nodeId: 'side-tabs'},
            {...drag, dockGroupNodeId: 'side-tabs', dockItemId: 'terminal'}
        )).toBeNull();

        let   refusedPublications = 0;
        const refused             = create(() => { refusedPublications++; return false });

        expect(refused.commitDrop(operation, drag)).toBeNull();
        expect(refusedPublications).toBe(1);
        // The executor is pure and a refused publication cannot retire the source workspace.
        expect(source.items.strategy).toBeDefined();
        expect(target.items.strategy).toBeUndefined();

        accepted.destroy();
        mismatch.destroy();
        refused.destroy()
    });

    test('foreign addTab and splitNode publish verbatim finite item records that remain topology-capturable', () => {
        for (const operation of [
            {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs'},
            {operation: 'splitNode', itemId: 'terminal', targetNodeId: 'main-tabs', orientation: 'horizontal', position: 'after', sizes: [0.5, 0.5]}
        ]) {
            const transfers     = [];
            const source        = sourceDoc();
            const target        = targetDoc();
            const sourceRecord  = {...source.items.terminal};
            const participation = Neo.create(DockCrossWindowParticipation, {
                commitTransfer    : published => transfers.push(published),
                dragCoordinator   : createCoordinatorStub([]),
                getDocument       : () => target,
                getForeignDocument: () => source,
                resolveOwnershipId: () => 'group-1',
            sortGroup         : 'dock-demo',
                windowId          : 'window-b',
                workspaceId       : 'B'
            });

            const result = participation.commitDrop(operation, {dockItemId: 'terminal', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'A'});

            expect(result).not.toBeNull();
            expect(transfers).toHaveLength(1);

            const {sourceDocument, targetDocument} = transfers[0];
            const record                           = targetDocument.items.terminal;

            // The generic dock item travels verbatim. Placement intent is perspective/workspace
            // state and must never make the published `dockZone.v1` catalog open-ended.
            expect(record).toEqual(sourceRecord);
            expect(record).not.toHaveProperty('owningWorkspaceId');
            expect(record).not.toHaveProperty('fallbackTarget');
            expect(WorkspaceDocument.validate(sourceDocument)).toEqual([]);
            expect(WorkspaceDocument.validate(targetDocument)).toEqual([]);

            // The finite writer is the integration tripwire that the former loose fields failed.
            // Exercise the real two-document capture for BOTH placement shapes.
            const captured = Persistence.captureTopologyPerspective({
                A: sourceDocument,
                B: targetDocument
            }, {
                layoutId       : `post-${operation.operation}`,
                perspectiveName: `Post ${operation.operation}`,
                revision       : 1,
                title          : `Post ${operation.operation}`
            });

            expect(captured.errors).toEqual([]);
            expect(captured.topology.schema).toBe(Persistence.TOPOLOGY_SCHEMA);
            expect(Object.keys(captured.topology.workspaces)).toEqual(['A', 'B']);

            participation.destroy()
        }
    });

    test('fails closed: missing payload identity, unresolvable source workspace, and executor rejections all commit NOTHING', () => {
        const transfers     = [];
        const participation = Neo.create(DockCrossWindowParticipation, {
            commitLocal       : () => { throw new Error('must not commit locally') },
            commitTransfer    : published => transfers.push(published),
            dragCoordinator   : createCoordinatorStub([]),
            getDocument       : () => targetDoc(),
            getForeignDocument: workspaceId => workspaceId === 'A' ? sourceDoc() : null,
            resolveOwnershipId: () => 'group-1',
            sortGroup         : 'dock-demo',
            windowId          : 'window-b',
            workspaceId       : 'B'
        });

        const operation = {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs'};

        // no dockItemId stamped on the payload → no guessing, no commit
        expect(participation.commitDrop(operation, {id: 'anonymous'})).toBeNull();
        // an unknown source workspace resolves no document → no commit
        expect(participation.commitDrop(operation, {dockItemId: 'terminal', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'ghost'})).toBeNull();
        // the executor rejects an invalid nested target → commit-or-neither holds, nothing publishes
        expect(participation.commitDrop({operation: 'moveItem', itemId: 'terminal'}, {dockItemId: 'terminal', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'A'})).toBeNull();
        // no ownership stamped → the payload cannot prove the source's commit authority → no commit
        expect(participation.commitDrop(operation, {dockItemId: 'terminal', dockSourceWorkspaceId: 'A'})).toBeNull();
        // another Group's payload naming THIS workspace's bare id → not local, not foreign: nothing (docking design record §2.3)
        expect(participation.commitDrop(operation, {dockItemId: 'terminal', dockSourceOwnershipId: 'group-2', dockSourceWorkspaceId: 'B'})).toBeNull();

        expect(transfers).toHaveLength(0);

        participation.destroy()
    });

    test('id collision across workspaces: a foreign payload whose id exists in the target NEVER rides the local seam — the executor rejects, nothing commits', () => {
        const locals    = [];
        const transfers = [];

        // the collision trap: the TARGET document also catalogs an item named `terminal`, so
        // item-id presence must not read as ownership — only workspace identity may
        const collisionTarget = () => {
            const doc = targetDoc();

            doc.items.terminal = {componentRef: 'terminal-b', title: 'Terminal B', kind: 'terminal'};
            doc.nodes['main-tabs'].items.push('terminal');

            return doc
        };

        const create = getDocument => Neo.create(DockCrossWindowParticipation, {
            commitLocal       : operation => { locals.push(operation); return {document: getDocument(), errors: []} },
            commitTransfer    : published => transfers.push(published),
            dragCoordinator   : createCoordinatorStub([]),
            getDocument,
            getForeignDocument: workspaceId => workspaceId === 'A' ? sourceDoc() : null,
            resolveOwnershipId: () => 'group-1',
            sortGroup         : 'dock-demo',
            windowId          : 'window-b',
            workspaceId       : 'B'
        });

        const operation   = {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs'};
        const foreignDrag = {dockItemId: 'terminal', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'A'};

        // source workspace A → target workspace B, both cataloging `terminal`: the discriminator
        // sends it FOREIGN, the executor's collision precondition rejects, commit-or-neither holds
        const collided = create(collisionTarget);

        expect(collided.commitDrop(operation, foreignDrag)).toBeNull();
        expect(locals).toHaveLength(0);
        expect(transfers).toHaveLength(0);

        // control: the identical gesture with the collision removed transfers cleanly — only the
        // collision blocked the commit, never the discrimination
        const clean = create(targetDoc);

        expect(clean.commitDrop(operation, foreignDrag)).not.toBeNull();
        expect(locals).toHaveLength(0);
        expect(transfers).toHaveLength(1);

        // an UNSTAMPED payload whose id happens to exist locally proves nothing → fails closed,
        // and in particular never rides the local seam on id-presence alone
        expect(clean.commitDrop({operation: 'addTab', itemId: 'alpha', tabsNodeId: 'main-tabs'}, {dockItemId: 'alpha'})).toBeNull();
        expect(locals).toHaveLength(0);

        collided.destroy();
        clean.destroy()
    });

    test('source→target through the REAL coordinator: a real DockTabSortZone engages a registered remote target, the drop transfers, exactly ONE local commit is suppressed', async () => {
        const fires     = [];
        const previews  = [];
        const transfers = [];

        // two windows on the coordinator's screen-space map: the source zone drags in win-a, the
        // registered target lives in win-b
        WindowManager.register({id: 'cwd-win-a', innerRect: new Rectangle(0, 0, 800, 600),    outerRect: new Rectangle(0, 0, 800, 600)});
        WindowManager.register({id: 'cwd-win-b', innerRect: new Rectangle(1000, 0, 800, 600), outerRect: new Rectangle(1000, 0, 800, 600)});

        // no dragCoordinator injected → the target registers with the REAL singleton
        const participation = Neo.create(DockCrossWindowParticipation, {
            commitLocal       : () => { throw new Error('a remote drop must never ride the local seam') },
            commitTransfer    : published => transfers.push(published),
            getDocument       : () => targetDoc(),
            getForeignDocument: workspaceId => workspaceId === 'A' ? sourceDoc() : null,
            hitTest           : () => true,
            previewFor        : payload => { previews.push(payload); return {itemId: payload.draggedItem.dockItemId, placement: {kind: 'tab-into'}} },
            previewToOperation: preview => ({operation: 'addTab', itemId: preview.itemId, tabsNodeId: 'main-tabs'}),
            resolveOwnershipId: () => 'group-1',
            sortGroup         : 'dock-crosswindow-source-test',
            windowId          : 'cwd-win-b',
            workspaceId       : 'B'
        });

        // window A's own registered surface (docking design record §2.3): the header zone below drags under its
        // ownership, as a dock window's header drags under the participation its workspace registered
        const sourceParticipation = Neo.create(DockCrossWindowParticipation, {
            getDocument       : () => sourceDoc(),
            resolveOwnershipId: () => 'group-1',
            sortGroup         : 'dock-crosswindow-source-test',
            windowId          : 'cwd-win-a',
            workspaceId       : 'A'
        });

        const zone = Neo.create(DockTabSortZone, {
            dockItemIds     : ['terminal'],
            dockSourceNodeId: 'side-tabs',
            dockWorkspaceId : 'A',
            owner           : {
                addDomListeners: () => {},
                cls            : [],
                dragResortable : false,
                items          : [],
                on             : () => {},
                style          : {},
                up             : () => ({fire: (name, data) => fires.push([name, data])})
            },
            sortGroup: 'dock-crosswindow-source-test',
            windowId : 'cwd-win-a'
        });

        // construct() preloads the coordinator OFF the drag hot path; in production that settles
        // frames before any gesture, so onDragMove's sync-on-entry engage always has its handle.
        // Await it here (the test creates + drags in the same tick) to model that warmed state.
        await zone.resolveDragCoordinator();

        // seed the mid-gesture drag state exactly as the base drag-start leaves it, with the
        // payload stamps exactly as this class's onDragStart writes them
        zone.dragComponent = {id: 'tab-proxy', dockItemId: 'terminal', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'A'};
        zone.dragProxy     = {hidden: false};
        zone.startIndex    = 0;

        // the REAL move lifecycle with the pointer in win-b's screen space: the coordinator
        // engages the registered remote target and suspends the source embodiment
        await zone.onDragMove({clientX: 60, clientY: 20, offsetX: 8, offsetY: 8, proxyRect: {width: 120, height: 32}, screenX: 1400, screenY: 300});

        expect(previews).toHaveLength(1);
        expect(previews[0].draggedItem).toBe(zone.dragComponent);
        expect(previews[0].localX).toBe(400); // screen 1400 − win-b origin 1000
        expect(zone.dragProxy.hidden).toBe(true);

        // the REAL end lifecycle: the drop commits through the coordinator → the real executor
        // transfers A→B, and the source suppresses its local cross-zone drop event
        await zone.processDragEnd({clientX: 60, clientY: 20});

        expect(transfers).toHaveLength(1);
        expect(transfers[0].targetDocument.items.terminal).toBeDefined();
        expect(zone.remoteDropCommitted).toBe(false); // consumed, never sticky
        expect(fires.filter(([name]) => name === 'dockCrossZoneDrop')).toHaveLength(0);

        // …suppressed exactly ONCE: the next gesture (no remote target engaged) fires the local
        // cross-zone drop again, and no second transfer occurs
        zone.dockItemIds   = ['strategy'];
        zone.dragComponent = {id: 'tab-proxy-2', dockItemId: 'strategy', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'A'};
        zone.startIndex    = 0;

        await zone.processDragEnd({clientX: 40, clientY: 10});

        expect(fires.filter(([name]) => name === 'dockCrossZoneDrop')).toHaveLength(1);
        expect(transfers).toHaveLength(1);

        participation.destroy();
        sourceParticipation.destroy();
        zone.destroy();
        WindowManager.unregister(WindowManager.get('cwd-win-a'));
        WindowManager.unregister(WindowManager.get('cwd-win-b'))
    });

    test('two same-shape roots on one App-Worker heap (docking design record §2.3): a drag from root A over root B previews nothing and commits nothing — both documents byte-identical — while A root → A popup still commits exactly once, in the same arm', async () => {
        const
            fires    = [],
            previews = [],
            commits  = [],
            docs     = {
                'a-main' : sourceDoc(),
                'a-popup': targetDoc(),
                'b-main' : sourceDoc(),
                'b-popup': targetDoc()
            },
            snapshot = () => JSON.stringify(docs),
            windows  = {
                'root-a-main' : new Rectangle(0,    0,   800, 600),
                'root-a-popup': new Rectangle(1000, 0,   800, 600),
                'root-b-main' : new Rectangle(0,    700, 800, 600),
                'root-b-popup': new Rectangle(1000, 700, 800, 600)
            };

        Object.entries(windows).forEach(([id, rect]) => WindowManager.register({id, innerRect: rect, outerRect: rect}));

        // Both roots use the SAME bare workspace ids — 'workstation-main' for the root document and
        // 'vessel-1' for the popup — exactly as two Workstation instances do. Only the Group differs.
        const participate = (root, key, workspaceId, windowId) => Neo.create(DockCrossWindowParticipation, {
            commitLocal   : () => { throw new Error(`${root}/${key}: a remote drop must never ride the local seam`) },
            commitTransfer: published => {
                commits.push([root, key, published.descriptor.itemId]);
                docs[`${root}-main`]   = published.sourceDocument;
                docs[`${root}-${key}`] = published.targetDocument;
                return true
            },
            getDocument       : () => docs[`${root}-${key}`],
            getForeignDocument: sourceWorkspaceId => sourceWorkspaceId === 'workstation-main' ? docs[`${root}-main`] : null,
            hitTest           : () => true,
            previewFor        : payload => { previews.push([root, key]); return {itemId: payload.draggedItem.dockItemId, placement: {kind: 'tab-into'}} },
            previewToOperation: preview => ({operation: 'addTab', itemId: preview.itemId, tabsNodeId: 'main-tabs'}),
            resolveOwnershipId: () => `group-${root}`,
            sortGroup         : 'dock-two-roots-test',
            windowId,
            workspaceId
        });

        const
            aMain  = participate('a', 'main',  'workstation-main', 'root-a-main'),
            aPopup = participate('a', 'popup', 'vessel-1',         'root-a-popup'),
            bMain  = participate('b', 'main',  'workstation-main', 'root-b-main'),
            bPopup = participate('b', 'popup', 'vessel-1',         'root-b-popup');

        // The header zone of root A's main window registers nothing and declares nothing: it drags under
        // aMain's ownership — the surface registered for its own window.
        const zone = Neo.create(DockTabSortZone, {
            dockItemIds     : ['terminal'],
            dockSourceNodeId: 'side-tabs',
            dockWorkspaceId : 'workstation-main',
            owner           : {addDomListeners: () => {}, cls: [], dragResortable: false, items: [], on: () => {}, style: {}, up: () => ({fire: (name, data) => fires.push([name, data])})},
            sortGroup       : 'dock-two-roots-test',
            windowId        : 'root-a-main'
        });

        await zone.resolveDragCoordinator();

        const
            before = snapshot(),
            frame  = (screenX, screenY) => ({clientX: 60, clientY: 20, offsetX: 8, offsetY: 8, proxyRect: {width: 120, height: 32}, screenX, screenY}),
            arm    = id => {
                zone.dragComponent = {id, dockItemId: 'terminal', dockSourceOwnershipId: zone.resolveSourceOwnershipId(), dockSourceWorkspaceId: 'workstation-main'};
                zone.dragProxy     = {hidden: false};
                zone.startIndex    = 0
            };

        arm('tab-proxy');
        expect(zone.dragComponent.dockSourceOwnershipId, 'the header zone drags under its window\'s registered surface').toBe('group-a');

        // NEGATIVE: over root B's main window (the same bare workspace id, another Group), then its popup.
        await zone.onDragMove(frame(400, 1000));
        await zone.onDragMove(frame(1400, 1000));
        await zone.processDragEnd({clientX: 60, clientY: 20});

        expect(previews, 'no preview for a target that cannot legally receive the item').toEqual([]);
        expect(commits).toEqual([]);
        expect(zone.dragProxy.hidden, 'no staged embodiment: the source proxy never hid').toBe(false);
        expect(snapshot(), 'both roots\' documents are byte-identical afterwards').toBe(before);

        // POSITIVE, same arm: A root → A popup previews once and commits exactly once.
        arm('tab-proxy-2');
        await zone.onDragMove(frame(1400, 300));
        await zone.processDragEnd({clientX: 60, clientY: 20});

        expect(previews).toEqual([['a', 'popup']]);
        expect(commits).toEqual([['a', 'popup', 'terminal']]);
        expect(docs['a-popup'].items.terminal).toBeDefined();
        expect(docs['a-main'].items.terminal, 'the source document lost the item').toBeUndefined();
        expect(JSON.stringify([docs['b-main'], docs['b-popup']]), 'root B is untouched by root A\'s gesture').toBe(JSON.stringify([sourceDoc(), targetDoc()]));

        [aMain, aPopup, bMain, bPopup].forEach(participation => participation.destroy());
        zone.destroy();
        Object.keys(windows).forEach(id => WindowManager.unregister(WindowManager.get(id)))
    });

    test('fire-and-forget move/end: the coordinator engages on move-ENTRY, so a release that does NOT await the move still commits once and suppresses the local drop once', async () => {
        const fires     = [];
        const order     = [];
        const transfers = [];

        // A recorder coordinator modelling the REAL synchronous contract: onDragMove ENGAGES a
        // target; onDragEnd commits ONLY if a target is engaged and then arms the source suppression
        // (exactly as the real DragCoordinator does via onRemoteDrop → onRemoteDropOut). If the end
        // ran before the move engaged, `engaged` would be false → no transfer, no suppression.
        const coordinator = {
            engaged   : false,
            register  : () => {},
            unregister: () => {},
            onDragMove: () => { order.push('engage'); coordinator.engaged = true },
            onDragEnd : ({draggedItem, sourceSortZone}) => {
                order.push('end');

                if (coordinator.engaged) {
                    transfers.push(draggedItem.dockItemId);
                    sourceSortZone.onRemoteDropOut(draggedItem)
                }
            }
        };

        const zone = Neo.create(DockTabSortZone, {
            dockItemIds     : ['terminal'],
            dockSourceNodeId: 'side-tabs',
            dockWorkspaceId : 'A',
            owner           : {
                addDomListeners: () => {},
                cls            : [],
                dragResortable : false,
                items          : [],
                on             : () => {},
                style          : {},
                up             : () => ({fire: (name, data) => fires.push([name, data])})
            },
            sortGroup: 'dock-crosswindow-ff-order-test',
            windowId : 'cwd-ff-a'
        });

        // let construct's real preload settle, THEN pin the recorder onto the synchronous handle
        await zone.resolveDragCoordinator();
        zone.dragCoordinator = coordinator;

        zone.dragComponent = {id: 'tab-proxy', dockItemId: 'terminal', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'A'};
        zone.dragProxy     = {hidden: false};
        zone.startIndex    = 0;

        // production-equivalent fire-and-forget ordering: START the move but DO NOT await it, then
        // run end while it is still in flight — exactly what DomEvent.fire's non-awaited dispatch
        // permits. The pre-fix shape (engage AFTER `await super.onDragMove`) fails here: the sync end
        // overtakes the suspended move, sees no engaged target, transfers nothing, fires the local drop.
        const movePromise = zone.onDragMove({clientX: 60, clientY: 20, offsetX: 8, offsetY: 8, proxyRect: {width: 120, height: 32}, screenX: 1400, screenY: 300});
        const endPromise  = zone.processDragEnd({clientX: 60, clientY: 20});

        await Promise.all([movePromise, endPromise]);

        expect(order).toEqual(['engage', 'end']);                                       // engage strictly before end
        expect(transfers).toEqual(['terminal']);                                        // committed exactly once
        expect(fires.filter(([name]) => name === 'dockCrossZoneDrop')).toHaveLength(0); // local drop suppressed once
        expect(zone.remoteDropCommitted).toBe(false);                                   // suppression flag consumed

        zone.destroy()
    });

    test('drag:cancel releases remote hover and emits only the dock cancel seam', async () => {
        const
            fires  = [],
            leaves = [];

        const zone = Neo.create(DockTabSortZone, {
            dockItemIds     : ['terminal'],
            dockSourceNodeId: 'side-tabs',
            dockWorkspaceId : 'A',
            owner           : {
                addDomListeners: () => {},
                cls            : [],
                dragResortable : false,
                items          : [],
                on             : () => {},
                style          : {},
                up             : () => ({fire: (name, data) => fires.push([name, data])})
            },
            sortGroup: 'dock-crosswindow-cancel-test',
            windowId : 'cwd-cancel-a'
        });

        await zone.resolveDragCoordinator();
        zone.dragCoordinator = DragCoordinator;
        zone.dragComponent   = {id: 'tab-proxy', dockItemId: 'terminal', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'A'};
        zone.startIndex      = 0;

        DragCoordinator.activeTargetZone = {
            onRemoteDragLeave: () => leaves.push('leave'),
            onRemoteDrop     : () => { throw new Error('cancel must never commit the remote target') }
        };

        await zone.processDragEnd({cancelled: true});

        expect(leaves).toEqual(['leave']);
        expect(DragCoordinator.activeTargetZone).toBeNull();
        expect(fires.filter(([name]) => name === 'dockCrossZoneDragCancel')).toHaveLength(1);
        expect(fires.filter(([name]) => name === 'dockCrossZoneDrop')).toHaveLength(0);

        zone.destroy()
    });

    test('a source zone without a sortGroup is coordinator-inert: no remote engagement, no suspension — the dock stays fully in-window', async () => {
        const previews = [];

        WindowManager.register({id: 'cwd-inert-a', innerRect: new Rectangle(0, 0, 800, 600),    outerRect: new Rectangle(0, 0, 800, 600)});
        WindowManager.register({id: 'cwd-inert-b', innerRect: new Rectangle(1000, 0, 800, 600), outerRect: new Rectangle(1000, 0, 800, 600)});

        const participation = Neo.create(DockCrossWindowParticipation, {
            getDocument: () => targetDoc(),
            hitTest    : () => true,
            previewFor : payload => { previews.push(payload); return {itemId: payload.draggedItem.dockItemId} },
            sortGroup  : 'dock-crosswindow-inert-test',
            windowId   : 'cwd-inert-b',
            workspaceId: 'B'
        });

        const zone = Neo.create(DockTabSortZone, {
            dockItemIds    : ['terminal'],
            dockWorkspaceId: 'A',
            owner          : {addDomListeners: () => {}, cls: [], dragResortable: false, items: [], on: () => {}, style: {}, up: () => null},
            windowId       : 'cwd-inert-a'
            // no sortGroup — the §2.3 opt-in axis stays unset
        });

        zone.dragComponent = {id: 'tab-proxy', dockItemId: 'terminal', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'A'};
        zone.dragProxy     = {hidden: false};
        zone.startIndex    = 0;

        await zone.onDragMove({clientX: 60, clientY: 20, offsetX: 8, offsetY: 8, proxyRect: {width: 120, height: 32}, screenX: 1400, screenY: 300});
        await zone.processDragEnd({clientX: 60, clientY: 20});

        expect(previews).toHaveLength(0);
        expect(zone.dragProxy.hidden).toBe(false);

        participation.destroy();
        zone.destroy();
        WindowManager.unregister(WindowManager.get('cwd-inert-a'));
        WindowManager.unregister(WindowManager.get('cwd-inert-b'))
    });

    /**
     * The seams the engine answers from state the workspace already holds. Every arm asserts the
     * default AND that a host value still wins: a default that cannot be overridden would be a
     * capability REMOVAL wearing the shape of an addition.
     */
    test.describe('seams the engine answers from workspace state', () => {
        const createWorkspaceStub = ({dockModel, projectionOptions, resolvePane, tearOutPanes, topologyGroupId='group-1'} = {}) => ({
            applied     : [],
            changes     : [],
            dockModel   : dockModel ?? targetDoc(),
            tearOutPanes: tearOutPanes ?? {},
            // the workspace's bound Group: the default commit authority its participation declares
            topologyGroupId,

            applyDockZoneOperation(descriptor) {
                this.applied.push(descriptor);

                return {document: this.dockModel, errors: []}
            },
            getDockHost() {
                return null
            },
            getDockProjectionOptions() {
                return projectionOptions ?? {}
            },
            onDockZoneDocumentChange(document, descriptor) {
                this.changes.push([document, descriptor])
            },
            resolvePane(itemId, item) {
                return resolvePane?.(itemId, item) ?? null
            }
        });

        const createParticipation = config => Neo.create(DockCrossWindowParticipation, {
            dragCoordinator: createCoordinatorStub(config.calls ?? []),
            windowId       : 'window-b',
            workspaceId    : 'B',
            ...config
        });

        test('a workspace publishing a cross-window sort group registers a target with no sortGroup seam', () => {
            const
                calls         = [],
                participation = createParticipation({
                    calls,
                    workspace: createWorkspaceStub({projectionOptions: {crossWindowSortGroup: 'dock-engine'}})
                });

            expect(calls).toHaveLength(1);
            expect(participation.target.sortGroup).toBe('dock-engine');

            participation.destroy()
        });

        test('a workspace publishing NO sort group registers nothing — the opt-in stays opt-in', () => {
            const
                calls         = [],
                participation = createParticipation({calls, workspace: createWorkspaceStub()});

            expect(calls).toHaveLength(0);
            expect(participation.target.sortGroup ?? null).toBeNull();

            participation.destroy()
        });

        test('a host sortGroup still wins over the workspace default', () => {
            const participation = createParticipation({
                sortGroup: 'host-group',
                workspace: createWorkspaceStub({projectionOptions: {crossWindowSortGroup: 'dock-engine'}})
            });

            expect(participation.target.sortGroup).toBe('host-group');

            participation.destroy()
        });

        test('an unset resolveOwnershipId rides the workspace\'s topology Group, read live — a workspace whose Group is unresolved declares null, never undefined, and commits nothing (docking design record §2.3)', () => {
            const
                workspace = createWorkspaceStub(),
                bound     = createParticipation({sortGroup: 'dock-engine', workspace}),
                unbound   = createParticipation({sortGroup: 'dock-engine', workspace: createWorkspaceStub({topologyGroupId: null})}),
                operation = {operation: 'addTab', itemId: 'alpha', tabsNodeId: 'main-tabs'};

            expect(bound.ownershipId).toBe('group-1');
            expect(bound.target.ownershipId, 'the registered target reads the same authority').toBe('group-1');

            // learned after registration: the next read sees it — nothing was cached at construct
            workspace.topologyGroupId = 'group-1b';
            expect(bound.target.ownershipId).toBe('group-1b');

            expect(unbound.ownershipId).toBeNull();
            expect(unbound.target.ownershipId, 'declared but unresolved is null, never undefined').toBeNull();
            expect(unbound.commitDrop(operation, {dockItemId: 'alpha', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'B'})).toBeNull();

            bound.destroy();
            unbound.destroy()
        });

        test('an unset commitLocal rides the workspace reducer pair', () => {
            const
                workspace     = createWorkspaceStub(),
                participation = createParticipation({sortGroup: 'dock-engine', workspace}),
                operation     = {operation: 'addTab', itemId: 'alpha', tabsNodeId: 'main-tabs'},
                result        = participation.commitDrop(operation, {dockItemId: 'alpha', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'B'});

            expect(workspace.applied).toEqual([operation]);
            expect(workspace.changes).toHaveLength(1);
            expect(result?.document).toBe(workspace.dockModel);

            participation.destroy()
        });

        test('an unset foreign pair rides the workspace set, and without a set a foreign drop fails closed', () => {
            const
                adopted   = [],
                source    = sourceDoc(),
                operation = {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs'},
                payload   = {dockItemId: 'terminal', dockSourceOwnershipId: 'group-1', dockSourceWorkspaceId: 'A'};

            const joined = createParticipation({
                sortGroup   : 'dock-engine',
                workspace   : createWorkspaceStub(),
                workspaceSet: {
                    adoptTransfer: data => {adopted.push(data); return true},
                    getDocument  : workspaceId => (workspaceId === 'A' ? source : null)
                }
            });

            expect(joined.commitDrop(operation, payload)).toBeTruthy();
            expect(adopted).toHaveLength(1);
            expect(adopted[0].sourceWorkspaceId).toBe('A');
            expect(adopted[0].targetWorkspaceId).toBe('B');

            joined.destroy();

            // No set means no sibling to resolve — the same drop must decline, not guess.
            const lone = createParticipation({sortGroup: 'dock-engine', workspace: createWorkspaceStub()});

            expect(lone.commitDrop(operation, payload)).toBeNull();

            lone.destroy()
        });

        test('the engine hit test answers window-local bounds and refuses everything outside them', () => {
            WindowManager.register({
                id       : 'cwd-default-win',
                innerRect: new Rectangle(0, 0, 800, 600),
                outerRect: new Rectangle(0, 0, 800, 600)
            });

            const participation = createParticipation({
                sortGroup: 'dock-engine',
                windowId : 'cwd-default-win',
                workspace: createWorkspaceStub()
            });

            expect(participation.target.acceptsRemoteDrag(10, 10)).toBe(true);
            expect(participation.target.acceptsRemoteDrag(900, 10)).toBe(false);
            expect(participation.target.acceptsRemoteDrag(10, 700)).toBe(false);
            expect(participation.target.acceptsRemoteDrag(Number.NaN, 10)).toBe(false);

            participation.destroy();
            WindowManager.unregister(WindowManager.get('cwd-default-win'))
        });

        test('an unset native-window resolver maps a moving popup back through the tear-out registry', () => {
            const
                pane          = {id: 'pane-terminal', isDestroyed: false},
                participation = createParticipation({
                    sortGroup: 'dock-engine',
                    workspace: createWorkspaceStub({
                        dockModel   : sourceDoc(),
                        resolvePane : itemId => (itemId === 'terminal' ? pane : null),
                        tearOutPanes: {terminal: {windowId: 'popup-1'}}
                    }),
                    workspaceId: 'A'
                });

            const resolved = participation.target.getNativeWindowDrag('popup-1');

            expect(resolved?.draggedItem).toBe(pane);
            expect(resolved.widgetName).toBe('terminal');
            expect(pane.dockItemId).toBe('terminal');
            expect(pane.dockSourceWorkspaceId).toBe('A');

            expect(participation.target.getNativeWindowDrag('popup-unknown')).toBeNull();

            participation.destroy()
        });

        test('the refinement seams stay null and a participation built without them degrades', () => {
            const participation = createParticipation({
                sortGroup: 'dock-engine',
                workspace: createWorkspaceStub()
            });

            for (const seam of [
                'awaitDragEmbodiment', 'promoteDragEmbodiment', 'restoreDragEmbodiment',
                'resumeNativeWindowDrag', 'retireNativeWindowDrag', 'stageDragEmbodiment',
                'suspendNativeWindowDrag'
            ]) {
                expect(participation[seam] ?? null, `${seam} stays host-owned`).toBeNull()
            }

            expect(() => participation.target.onRemoteDragLeave()).not.toThrow();

            participation.destroy()
        })
    })
});
