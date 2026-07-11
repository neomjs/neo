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
 * @summary Tests for Neo.dashboard.DockCrossWindowParticipation — the adapter-tier composition
 * that wires ONE dock workspace into the §2.3 cross-window contract over landed machinery only:
 * target registration lifecycle, the owner seams, foreign-vs-local drop discrimination, the
 * atomic `transferItem` composition, and the durable placement-hint updates riding the same
 * commit. The executor itself is the REAL DockZoneModel — no transfer semantics are mocked.
 */

/** A fresh source-workspace document ('A') — `terminal` is the item every transfer moves. */
function sourceDoc() {
    return {
        schema: 'neo.harness.dockZone.v1',
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
        schema: 'neo.harness.dockZone.v1',
        root  : 'root',
        items : {alpha: {componentRef: 'alpha', title: 'Alpha', kind: 'panel'}},
        nodes : {
            root       : {type: 'edge-zone', zones: {center: 'main-tabs'}},
            'main-tabs': {type: 'tabs', items: ['alpha'], activeItemId: 'alpha'}
        }
    }
}

test.describe('Neo.dashboard.DockCrossWindowParticipation (ADR 0029 §2.3 — workspace wiring)', () => {
    let DockCrossWindowParticipation;

    const createCoordinatorStub = calls => ({
        register  : zone => calls.push(['register', zone]),
        unregister: zone => calls.push(['unregister', zone])
    });

    test.beforeAll(async () => {
        DockCrossWindowParticipation = (await import('../../../../src/dashboard/DockCrossWindowParticipation.mjs')).default
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
        // `alpha` lives in THIS workspace's committed catalog → the LOCAL seam committed it
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

    test('durable placement hints ride the SAME commit: owningWorkspaceId + semantic fallbackTarget, for addTab AND splitNode shapes', () => {
        for (const [operation, expectedNodeId] of [
            [{operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs'}, 'main-tabs'],
            [{operation: 'splitNode', itemId: 'terminal', targetNodeId: 'main-tabs', orientation: 'horizontal', position: 'after', sizes: [0.5, 0.5]}, 'main-tabs']
        ]) {
            const transfers     = [];
            const participation = Neo.create(DockCrossWindowParticipation, {
                commitTransfer    : published => transfers.push(published),
                dragCoordinator   : createCoordinatorStub([]),
                getDocument       : () => targetDoc(),
                getForeignDocument: () => sourceDoc(),
                sortGroup         : 'dock-demo',
                windowId          : 'window-b',
                workspaceId       : 'B'
            });

            participation.commitDrop(operation, {dockItemId: 'terminal', dockSourceWorkspaceId: 'A'});

            const record = transfers[0].targetDocument.items.terminal;

            // the hints are in the PUBLISHED document — same commit, never a follow-up write;
            // the fallback is a semantic node reference, never geometry (§2.1 durable tier)
            expect(record.owningWorkspaceId).toBe('B');
            expect(record.fallbackTarget).toEqual({nodeId: expectedNodeId, workspaceId: 'B'});

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
});
