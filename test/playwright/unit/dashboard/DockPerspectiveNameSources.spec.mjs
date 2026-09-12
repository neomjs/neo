import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';
import Workspace          from '../../../../src/dashboard/dock/Workspace.mjs';
import WorkspaceSet       from '../../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import Document           from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Persistence        from '../../../../src/dashboard/dock/model/Persistence.mjs';
import Authoring          from '../../../../src/dashboard/dock/model/Authoring.mjs';
import PerspectiveLibrary from '../../../../src/dashboard/dock/persistence/PerspectiveLibrary.mjs';
import TopologyLibrary    from '../../../../src/dashboard/dock/persistence/TopologyLibrary.mjs';
import Transaction        from '../../../../src/manager/Transaction.mjs';

setup({appConfig: {name: 'DockPerspectiveNameSourcesTest'}});

const PANES        = {editor: {ntype: 'component'}, preview: {ntype: 'component'}},
      PERSPECTIVES = {operator: {center: ['editor', 'preview']}, review: {center: ['preview', 'editor']}};

/**
 * A real declarative workspace, optionally registered in a Group. `zonesOnly` declares no
 * perspectives, so the single arrangement lowers under the engine-reserved name.
 */
function fixture({group = false, zonesOnly = false, active = 'operator'} = {}) {
    const windowId  = `names-${Neo.getId('test')}`,
          binding   = group && Transaction.bind({windowId, workspaceKey: 'main'}),
          workspace = Neo.create(Workspace, {
              windowId,
              enableDockMaximizeAction: false,
              panes                   : PANES,
              ...(zonesOnly ? {zones: {center: ['editor', 'preview']}} : {perspectives: PERSPECTIVES, activePerspective: active})
          }),
          set = group && Neo.create(WorkspaceSet, {manager: Transaction, getGroupId: () => binding.groupId, documentModel: Document});

    if (group) {
        Transaction.setHistoryDepth({groupId: binding.groupId, depth: 5});
        workspace.workspaceKey = 'main';
        workspace.workspaceSet = set;
        set.register('main', {
            componentId: workspace.id,
            getDocument: () => workspace.dockModel,
            setDocument: value => workspace.dockModel = value,
            project    : context => workspace.projectDockCommit(context)
        })
    }

    return {
        workspace, set, groupId: binding?.groupId,
        async settle() {await workspace.perspectiveSelection?.pending; await workspace.refreshPromise},
        destroy() {
            set && set.destroy();
            if (!workspace.isDestroyed) workspace.destroy();
            binding && Transaction.retireGroup(binding.groupId)
        }
    }
}

const layoutFor = (document, options) => Persistence.capturePerspective(document, options);

test.describe('Neo.dashboard.dock — perspective names come from the declared list; snapshots never define one', () => {
    test('a layout store refuses a declared name and an engine-reserved name on both persisted keys, on save and on rename', () => {
        const f     = fixture(), {workspace} = f,
              store = Neo.create(PerspectiveLibrary, {declaredPerspectives: () => workspace.declaredPerspectives()});

        try {
            const byName = layoutFor(workspace.dockModel, {layoutId: 'snap-1', perspectiveName: 'review'});
            expect(byName.errors).toEqual([]);

            let result = store.savePerspective(byName.layout);
            expect(result.saved).toBe(false);
            expect(result.errors.join()).toContain('"review" names a declared perspective');

            result = store.savePerspective(layoutFor(workspace.dockModel, {layoutId: 'review', perspectiveName: 'Mine'}).layout);
            expect(result.saved, 'the technical key is refused as well').toBe(false);
            expect(result.errors.join()).toContain('"review" names a declared perspective');

            result = store.savePerspective(layoutFor(workspace.dockModel, {layoutId: 'snap-2', perspectiveName: Authoring.defaultPerspectiveName}).layout);
            expect(result.saved).toBe(false);
            expect(result.errors.join()).toContain('engine-reserved');

            expect(store.savePerspective(layoutFor(workspace.dockModel, {layoutId: 'snap-3', perspectiveName: 'Mine'}).layout).saved).toBe(true);

            const renamed = store.renamePerspective('Mine', 'operator');
            expect(renamed.renamed).toBe(false);
            expect(renamed.errors.join()).toContain('names a declared perspective');
            expect(store.renamePerspective('Mine', '$snapshot').errors.join()).toContain('engine-reserved');
            expect(store.renamePerspective('Mine', 'Yours').renamed).toBe(true);

            // Nothing a refused save does reaches the selection.
            expect(workspace.perspectiveSelection.committedName).toBe('operator');
            expect(workspace.activePerspective).toBe('operator');
        } finally {
            store.destroy();
            f.destroy()
        }
    });

    test('a store without declared wiring still refuses engine-reserved names and accepts the rest', () => {
        const f = fixture(), {workspace} = f, store = Neo.create(PerspectiveLibrary, {});

        try {
            expect(store.savePerspective(layoutFor(workspace.dockModel, {layoutId: 'snap-1', perspectiveName: 'review'}).layout).saved).toBe(true);
            expect(store.savePerspective(layoutFor(workspace.dockModel, {layoutId: '$default'}).layout).errors.join()).toContain('engine-reserved');
        } finally {
            store.destroy();
            f.destroy()
        }
    });

    test('a topology store refuses declared and engine-reserved layout ids while the plain "default" record stays usable', () => {
        const f       = fixture(), {workspace} = f,
              library = Neo.create(TopologyLibrary, {declaredPerspectives: () => workspace.declaredPerspectives()}),
              capture = layoutId => Persistence.captureTopologyPerspective({main: workspace.dockModel}, {layoutId});

        try {
            expect(capture('review').errors).toEqual([]);
            expect(library.save(capture('review').topology, {activate: true}).errors.join()).toContain('names a declared perspective');
            expect(library.save(capture('$default').topology, {activate: true}).errors.join()).toContain('engine-reserved');
            expect(library.save(capture('default').topology, {activate: true}).saved).toBe(true);
            expect(library.collection.activeLayoutId).toBe('default');
        } finally {
            library.destroy();
            f.destroy()
        }
    });

    test('a capture carries the declared origin from the accepted-write identity, including inside a commit listener before projection', async () => {
        const f      = fixture({group: true}), {workspace, groupId} = f, seen = [],
              commit = data => {data.groupId === groupId && seen.push(workspace.perspectiveProvenance().declaredPerspective)};

        Transaction.on({commit});

        try {
            expect(workspace.perspectiveProvenance()).toEqual({declaredPerspective: 'operator'});

            workspace.activePerspective = 'review';
            await f.settle();

            // Auto-save captures here, before the projection has synchronized anything public.
            expect(seen).toEqual(['review']);

            const {layout, errors} = Persistence.capturePerspective(workspace.dockModel, {layoutId: 'snap', metadata: workspace.perspectiveProvenance()});
            expect(errors).toEqual([]);
            expect(layout.metadata).toEqual({declaredPerspective: 'review'});
            expect(Persistence.restoreSavedLayout(layout).errors).toEqual([]);
            expect(Persistence.restoreSavedLayout({...layout, metadata: {declaredPerspective: 42}}).errors.join()).toContain('declaredPerspective');

            const topology = Persistence.captureTopologyPerspective({main: workspace.dockModel}, {layoutId: 'topo', metadata: workspace.perspectiveProvenance()});
            expect(topology.errors).toEqual([]);
            expect(topology.topology.metadata).toEqual({declaredPerspective: 'review'});
            expect(Persistence.restoreTopology({...topology.topology, metadata: {declaredPerspective: ''}}).errors.join()).toContain('declaredPerspective');
        } finally {
            Transaction.un({commit});
            f.destroy()
        }
    });

    test('under a Group a known-origin hydrate adopts the declared origin and an originless one retains the baseline, with no history row either way', async () => {
        const f = fixture({group: true}), {workspace, groupId} = f, errors = [], original = console.error;

        console.error = (...args) => errors.push(args);

        try {
            await workspace.perspectiveSelection.pending;

            const selection = workspace.perspectiveSelection,
                  reviewDoc = selection.document('review'),
                  hydrate   = (document, metadata) => Transaction.write({
                      groupId,
                      cause       : 'cold-hydrate',
                      cursorAction: 'preserve',
                      descriptor  : {operation: 'hydrateTopology', layoutId: 'snap'},
                      changes     : [{workspaceKey: 'main', input: document}, workspace.perspectiveOriginChange(metadata)].filter(Boolean)
                  });

            await hydrate(reviewDoc, {declaredPerspective: 'review'});
            await workspace.refreshPromise;
            expect(selection.committedName).toBe('review');
            expect(workspace.activePerspective).toBe('review');
            expect(Transaction.get(groupId).history?.count ?? 0, 'a preserve write appends no row').toBe(0);

            await hydrate(selection.document('operator'), {});
            await workspace.refreshPromise;
            expect(selection.committedName, 'an originless snapshot changes no selection').toBe('review');
            expect(workspace.activePerspective).toBe('review');

            expect(workspace.perspectiveOriginChange({declaredPerspective: 'stranger'}), 'an origin this workspace does not declare is originless').toBeNull();

            workspace.activePerspective = 'missing';
            expect(workspace.activePerspective, 'a refused selection round-trips without null').toBe('review');
            expect(errors).toHaveLength(1);

            expect((await workspace.resetPerspective()).errors).toEqual([]);
            await workspace.refreshPromise;
            expect(workspace.dockModel, 'reset re-applies the committed baseline').toEqual(reviewDoc);
        } finally {
            console.error = original;
            f.destroy()
        }
    });

    test('on the direct branch a snapshot restore adopts the origin its descriptor carries and retains the baseline without one', async () => {
        const f = fixture(), {workspace} = f, selection = workspace.perspectiveSelection;

        try {
            const {layout} = Persistence.capturePerspective(selection.document('review'), {layoutId: 'snap', metadata: {declaredPerspective: 'review'}}),
                  restored = Persistence.restoreSavedLayout(layout);

            expect(restored.errors).toEqual([]);
            await workspace.onDockZoneDocumentChange(restored.document, {operation: 'restoreSavedLayout', layoutId: 'snap', ...layout.metadata}, workspace);
            await workspace.refreshPromise;
            expect(workspace.activePerspective).toBe('review');
            expect(selection.committedName).toBe('review');

            const originless = Persistence.capturePerspective(selection.document('operator'), {layoutId: 'snap-2'});
            await workspace.onDockZoneDocumentChange(Persistence.restoreSavedLayout(originless.layout).document, {operation: 'restoreSavedLayout', layoutId: 'snap-2'}, workspace);
            await workspace.refreshPromise;
            expect(workspace.activePerspective).toBe('review');
            expect(selection.committedName).toBe('review');
        } finally {
            f.destroy()
        }
    });

    test('a zones-only workspace declares the engine-reserved name, and a host without declarations reports nothing', () => {
        const f = fixture({zonesOnly: true}), {workspace} = f, bare = Neo.create(Workspace, {enableDockMaximizeAction: false});

        try {
            expect(workspace.declaredPerspectives()).toEqual([Authoring.defaultPerspectiveName]);
            expect(workspace.activePerspective).toBe(Authoring.defaultPerspectiveName);
            expect(workspace.perspectiveProvenance()).toEqual({declaredPerspective: Authoring.defaultPerspectiveName});
            expect(Authoring.defaultPerspectiveName.startsWith(Persistence.RESERVED_NAME_PREFIX)).toBe(true);

            expect(bare.declaredPerspectives()).toEqual([]);
            expect(bare.perspectiveProvenance()).toEqual({});
            expect(bare.perspectiveOriginChange({declaredPerspective: 'operator'})).toBeNull();
        } finally {
            bare.destroy();
            f.destroy()
        }
    });
});
