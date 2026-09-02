import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DockOperationChangeClassTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';
import DockWorkspace from '../../../../src/dashboard/dock/Workspace.mjs';
import Operations    from '../../../../src/dashboard/dock/model/Operations.mjs';

/**
 * The refresh shape a commit gets when the consumer writes NO hooks.
 *
 * `getRefreshOptions` used to return `{}` — the full staged transaction for every commit — so a
 * `setItemLocked` that assigns one boolean on one item restaged the shell, re-parented the splits
 * and edge rows, and made every retained header in the app repaint. The engine always had the
 * knowledge to answer better: `model/Operations` implements the reducers, so only it can say that
 * `setItemLocked` touches `nodes` nowhere while `moveItem` restructures.
 *
 * These arms use a BARE `Neo.dashboard.dock.Workspace`. The shared fixture elsewhere in this suite
 * overrides `getRefreshOptions`, which is why the derived default needs its own witness — an arm on
 * an overriding workspace would pass whether or not a default exists.
 *
 * @see https://github.com/neomjs/neo/issues/18152
 */

/**
 * A workspace with no hooks written, and a document whose item flags the arm controls.
 * @param {Object} [items] itemId → item record
 * @returns {Neo.dashboard.dock.Workspace}
 */
function bareWorkspace(items = {panel: {}}) {
    const workspace = Neo.create(DockWorkspace, {});

    workspace.dockModel = {schema: 'neo.dock.zone.v1', root: 'root', items, nodes: {}};

    return workspace
}

test.describe('Neo.dashboard.dock.model.Operations — the change-class beside the reducer (#18152)', () => {
    test('every dispatchable operation declares a change class', () => {
        const dispatch = Object.keys(Operations.operationHandlers),
              declared = Object.keys(Operations.operationChangeClass),
              missing  = dispatch.filter(name => !declared.includes(name));

        // Non-vacuity: an empty dispatch table would make the comparison below trivially true.
        expect(dispatch.length, 'the dispatch table must be populated').toBeGreaterThan(10);

        // The file's own idiom is that dispatch and vocabulary "cannot diverge by construction".
        // A sibling map cannot inherit that guarantee, so this arm IS the guarantee: a new
        // operation added to dispatch without a class fails here rather than silently degrading.
        expect(missing, 'every operation in the dispatch table carries a change class').toEqual([]);

        // And the reverse, so the map cannot accumulate names the vocabulary dropped.
        expect(declared.filter(name => !dispatch.includes(name)),
            'the class map declares nothing the dispatch table does not').toEqual([])
    });

    test('the three item-flag reducers are classed as item-flag deltas, and the restructuring ones are not', () => {
        // Verifiable rather than asserted: each of these clones the document and assigns exactly one
        // field under `items`, touching `nodes` nowhere — which is what makes an item-only refresh
        // sound for them in the first place.
        for (const op of ['setItemLocked', 'setItemPinned', 'setItemAutoHidden']) {
            expect(Operations.changeClassFor(op), `${op} writes one item field`).toBe('itemFlags')
        }

        for (const op of ['resizeSplit', 'resizeEdgeZone']) {
            expect(Operations.changeClassFor(op), `${op} moves a boundary`).toBe('geometry')
        }

        for (const op of ['addTab', 'moveItem', 'splitNode', 'moveNode', 'closeItem', 'detachItem']) {
            expect(Operations.changeClassFor(op), `${op} may restructure`).toBe('topology')
        }
    });

    test('an operation with no declared class is treated as topology, never as a fast path', () => {
        // The fallback is the whole safety property: a vocabulary that grows without updating the
        // map degrades to today's full transaction — slow — rather than to a wrong fast path.
        expect(Operations.changeClassFor('someOperationFromTheFuture')).toBe('topology');
        expect(Operations.changeClassFor(undefined)).toBe('topology');

        // Own-key lookup only, for the reason `applyOperation` uses one: an inherited name must
        // resolve like any unknown operation rather than to a prototype member.
        expect(Operations.changeClassFor('constructor'), 'an inherited name is not a class').toBe('topology');
        expect(Operations.changeClassFor('__proto__')).toBe('topology')
    })
});

test.describe('Neo.dashboard.dock.Workspace — getRefreshOptions derives from the change class (#18152)', () => {
    test('a consumer that writes no hooks gets the narrow refresh its operation deserves', () => {
        const workspace = bareWorkspace();

        try {
            expect(workspace.getRefreshOptions({operation: 'setItemLocked', itemId: 'panel'}),
                'an item-flag delta reconciles items in place').toEqual({retainTopology: true});

            expect(workspace.getRefreshOptions({operation: 'resizeSplit'}),
                'a boundary move is geometry-only').toEqual({geometryOnly: true});

            expect(workspace.getRefreshOptions({operation: 'moveItem', itemId: 'panel'}),
                'a restructuring operation still takes the full transaction').toEqual({});

            expect(workspace.getRefreshOptions({operation: 'someOperationFromTheFuture'}),
                'and so does an undeclared one').toEqual({});

            expect(workspace.getRefreshOptions(null),
                'a commit that identifies no operation is not a fast path').toEqual({})
        } finally {
            workspace.destroy()
        }
    });

    test('a RAILED item takes the full transaction even though its document delta is item-only', () => {
        // The change class describes the DOCUMENT and is exact — `setItemLocked` touches `nodes`
        // nowhere. That is necessary for the fast path but not sufficient: a railed pane is
        // projected outside the shell, and `reconcileStableTopology` admits the fast path on "every
        // structural dock node retains identity", which stays true while the rail still holds the
        // old pane. Without this guard the rail keeps a stale copy beside the fresh one — worse
        // than the slow path it replaced. Placement is the workspace's half of the answer.
        const workspace = bareWorkspace({
            panel : {},
            railed: {autoHidden: true},
            pinned: {autoHidden: true, pinned: true}
        });

        try {
            expect(workspace.getRefreshOptions({operation: 'setItemLocked', itemId: 'railed'}),
                'a railed item cannot take the item-only path').toEqual({});

            expect(workspace.getRefreshOptions({operation: 'setItemLocked', itemId: 'panel'}),
                'a shell item still can — the guard is placement, not the operation').toEqual({retainTopology: true});

            expect(workspace.getRefreshOptions({operation: 'setItemLocked', itemId: 'pinned'}),
                'a pinned item renders in the shell, so it keeps the fast path').toEqual({retainTopology: true})
        } finally {
            workspace.destroy()
        }
    });

    test('a host override still wins outright over the derived default', () => {
        // The hook survives as an override layered over a working default, which is the whole
        // point of the epic: a hook a host writes must be a deliberate choice, never a repair.
        const workspace = bareWorkspace();

        try {
            workspace.getRefreshOptions = () => ({preserveItemIds: ['editor']});

            expect(workspace.getRefreshOptions({operation: 'setItemLocked', itemId: 'panel'}),
                'the override replaces the derived answer entirely').toEqual({preserveItemIds: ['editor']})
        } finally {
            workspace.destroy()
        }
    })
});
