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
            root       : {type: 'edge-zone', zones: {center: 'main-tabs', right: 'side-tabs'}},
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
            root       : {type: 'edge-zone', zones: {center: 'main-tabs'}},
            'main-tabs': {type: 'tabs', items: ['alpha'], activeItemId: 'alpha'}
        }
    }
}

test.describe('Neo.dashboard.dock.window.Participation (ADR 0029 §2.3 — workspace wiring)', () => {
    let DockCrossWindowParticipation, DockTabSortZone, Document, DragCoordinator, Persistence, Rectangle, WindowManager;

    const createCoordinatorStub = calls => ({
        register  : zone => calls.push(['register', zone]),
        unregister: zone => calls.push(['unregister', zone])
    });

    test.beforeAll(async () => {
        DockCrossWindowParticipation = (await import('../../../../src/dashboard/dock/window/Participation.mjs')).default;
        DockTabSortZone              = (await import('../../../../src/dashboard/dock/interaction/TabSortZone.mjs')).default;
        Document                     = (await import('../../../../src/dashboard/dock/model/Document.mjs')).default;
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
            sortGroup         : 'dock-demo',
            windowId          : 'window-b',
            workspaceId       : 'B'
        });

        const draggedItem = {dockItemId: 'alpha', dockSourceWorkspaceId: 'B'};
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
            sortGroup         : 'dock-demo',
            windowId          : 'window-b',
            workspaceId       : 'B'
        });

        const result = participation.commitDrop(
            {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs'},
            {dockItemId: 'terminal', dockSourceWorkspaceId: 'A'}
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
        target.nodes.root.zones.center = 'target-tabs';
        delete target.nodes['main-tabs'];

        const create = commitTransfer => Neo.create(DockCrossWindowParticipation, {
            commitTransfer,
            dragCoordinator   : createCoordinatorStub([]),
            getDocument       : () => target,
            getForeignDocument: workspaceId => workspaceId === 'A' ? source : null,
            sortGroup         : 'dock-demo',
            windowId          : 'window-b',
            workspaceId       : 'B'
        });
        const operation = {
            operation: 'transferNode',
            nodeId   : 'main-tabs',
            target   : {targetNodeId: 'target-tabs', placement: {kind: 'tab-into'}}
        };
        const drag     = {dockGroupNodeId: 'main-tabs', dockItemId: 'strategy', dockSourceWorkspaceId: 'A'};
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
                sortGroup         : 'dock-demo',
                windowId          : 'window-b',
                workspaceId       : 'B'
            });

            const result = participation.commitDrop(operation, {dockItemId: 'terminal', dockSourceWorkspaceId: 'A'});

            expect(result).not.toBeNull();
            expect(transfers).toHaveLength(1);

            const {sourceDocument, targetDocument} = transfers[0];
            const record                           = targetDocument.items.terminal;

            // The generic dock item travels verbatim. Placement intent is perspective/workspace
            // state and must never make the published `dockZone.v1` catalog open-ended.
            expect(record).toEqual(sourceRecord);
            expect(record).not.toHaveProperty('owningWorkspaceId');
            expect(record).not.toHaveProperty('fallbackTarget');
            expect(Document.validate(sourceDocument)).toEqual([]);
            expect(Document.validate(targetDocument)).toEqual([]);

            // The finite writer is the integration tripwire that the former loose fields failed.
            // Exercise the real two-document capture for BOTH placement shapes.
            const captured = Persistence.captureTopologyPerspective([sourceDocument, targetDocument], {
                layoutId       : `post-${operation.operation}`,
                perspectiveName: `Post ${operation.operation}`,
                revision       : 1,
                title          : `Post ${operation.operation}`
            });

            expect(captured.errors).toEqual([]);
            expect(captured.layout.captureScope).toBe('topology');
            expect(captured.layout.windowDocuments).toHaveLength(1);

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
            sortGroup         : 'dock-demo',
            windowId          : 'window-b',
            workspaceId       : 'B'
        });

        const operation = {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs'};

        // no dockItemId stamped on the payload → no guessing, no commit
        expect(participation.commitDrop(operation, {id: 'anonymous'})).toBeNull();
        // an unknown source workspace resolves no document → no commit
        expect(participation.commitDrop(operation, {dockItemId: 'terminal', dockSourceWorkspaceId: 'ghost'})).toBeNull();
        // the executor rejects an invalid nested target → commit-or-neither holds, nothing publishes
        expect(participation.commitDrop({operation: 'moveItem', itemId: 'terminal'}, {dockItemId: 'terminal', dockSourceWorkspaceId: 'A'})).toBeNull();

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
            sortGroup         : 'dock-demo',
            windowId          : 'window-b',
            workspaceId       : 'B'
        });

        const operation   = {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs'};
        const foreignDrag = {dockItemId: 'terminal', dockSourceWorkspaceId: 'A'};

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
            sortGroup         : 'dock-crosswindow-source-test',
            windowId          : 'cwd-win-b',
            workspaceId       : 'B'
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
        zone.dragComponent = {id: 'tab-proxy', dockItemId: 'terminal', dockSourceWorkspaceId: 'A'};
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
        zone.dragComponent = {id: 'tab-proxy-2', dockItemId: 'strategy', dockSourceWorkspaceId: 'A'};
        zone.startIndex    = 0;

        await zone.processDragEnd({clientX: 40, clientY: 10});

        expect(fires.filter(([name]) => name === 'dockCrossZoneDrop')).toHaveLength(1);
        expect(transfers).toHaveLength(1);

        participation.destroy();
        zone.destroy();
        WindowManager.unregister(WindowManager.get('cwd-win-a'));
        WindowManager.unregister(WindowManager.get('cwd-win-b'))
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

        zone.dragComponent = {id: 'tab-proxy', dockItemId: 'terminal', dockSourceWorkspaceId: 'A'};
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
        zone.dragComponent   = {id: 'tab-proxy', dockItemId: 'terminal', dockSourceWorkspaceId: 'A'};
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

        zone.dragComponent = {id: 'tab-proxy', dockItemId: 'terminal', dockSourceWorkspaceId: 'A'};
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
});
