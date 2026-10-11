import {setup}        from '../../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import '../../../../../src/tab/Container.mjs';
import DockService    from '../../../../../src/ai/client/DockService.mjs';
import Persistence    from '../../../../../src/dashboard/dock/model/Persistence.mjs';
import Workspace      from '../../../../../src/dashboard/dock/Workspace.mjs';

setup({appConfig: {name: 'DockServiceDeclaredPerspectivesTest'}});

const PANES        = {editor: {ntype: 'component'}, preview: {ntype: 'component'}},
      PERSPECTIVES = {operator: {center: ['editor', 'preview']}, review: {center: ['preview', 'editor']}};

/**
 * A real declaring workspace, resolved by the service through the component registry like any
 * live holder. `rows` records every descriptor the standalone document-write path carries.
 */
function fixture({active = 'operator'} = {}) {
    const rows      = [],
          workspace = Neo.create(Workspace, {
              windowId                : `declared-${Neo.getId('test')}`,
              enableDockMaximizeAction: false,
              panes                   : PANES,
              perspectives            : PERSPECTIVES,
              activePerspective       : active
          }),
          original = workspace.onDockZoneDocumentChange;

    workspace.onDockZoneDocumentChange = function(document, descriptor, source) {
        rows.push(descriptor);
        return original.call(this, document, descriptor, source)
    };

    if (Neo.getComponent(workspace.id) !== workspace) throw new Error('the workspace is not resolvable by id');

    return {
        rows, workspace,
        baseline: name => workspace.perspectiveSelection.document(name),
        async settle() {await workspace.perspectiveSelection?.pending; await workspace.refreshPromise},
        destroy() {!workspace.isDestroyed && workspace.destroy()}
    }
}

test.describe('Neo.ai.client.DockService — the perspective tools see declared perspectives', () => {
    let service;

    test.beforeEach(() => {service = Neo.create(DockService, {})});
    test.afterEach(() => {service.destroy()});

    test('list_perspectives: declared names come with the published facts beside empty stores; a holder that declares nothing and holds no store still fails closed', async () => {
        const f = fixture(), {workspace} = f;

        try {
            await f.settle();

            const listed = await service.listPerspectives({componentId: workspace.id});
            expect(listed.errors).toEqual([]);
            expect(listed.declared).toEqual(['operator', 'review']);
            expect(listed.perspective).toEqual({active: 'operator', modified: false, pending: null});
            expect(listed.perspectives, 'no layout store: an empty list, never a fabricated record').toEqual([]);
            expect(listed.topologies).toEqual([]);
            expect(listed.activeLayoutId).toBeNull();

            // A document that left the active baseline reads as modified — the same fact the provider publishes.
            workspace.dockModel = f.baseline('review');
            await f.settle();
            expect((await service.listPerspectives({componentId: workspace.id})).perspective).toEqual({active: 'operator', modified: true, pending: null});

            // The plain holder shape has no declared list and keeps its fail-closed refusal.
            const originalGetComponent = Neo.getComponent;
            Neo.getComponent = () => ({id: 'plain-1', dockZoneDocument: f.baseline('operator')});
            try {
                const bare = await service.listPerspectives({componentId: 'plain-1'});
                expect(bare.declared).toEqual([]);
                expect(bare.perspective).toBeNull();
                expect(bare.perspectives).toBeNull();
                expect(bare.errors[0]).toContain('no perspective or topology store')
            } finally {
                Neo.getComponent = originalGetComponent
            }
        } finally {
            f.destroy()
        }
    });

    test('restore_perspective of a declared name takes the activePerspective write: the row carries {workspaceKey, before, after}, the active name re-applies its baseline, an unknown name is a declared refusal', async () => {
        const f = fixture(), {workspace, rows} = f;

        try {
            await f.settle();

            const switched = await service.restorePerspective({componentId: workspace.id, name: 'review'});
            expect(switched).toMatchObject({captureScope: 'window', errors: [], schema: null, source: 'declared', switched: true});
            expect(workspace.activePerspective).toBe('review');
            expect(switched.document).toEqual(f.baseline('review'));
            expect(rows.at(-1)).toMatchObject({operation: 'restorePerspective', before: 'operator', after: 'review'});
            expect(rows.at(-1)).toHaveProperty('workspaceKey');

            // The active name: an equal config assignment is a no-op, so the tool re-applies the baseline explicitly.
            workspace.dockModel = f.baseline('operator');
            await f.settle();
            expect((await service.listPerspectives({componentId: workspace.id})).perspective.modified).toBe(true);

            const reapplied = await service.restorePerspective({componentId: workspace.id, name: 'review'});
            expect(reapplied).toMatchObject({errors: [], source: 'declared', switched: true});
            expect(reapplied.document).toEqual(f.baseline('review'));
            expect(rows.at(-1)).toMatchObject({operation: 'restorePerspective', before: 'review', after: 'review'});
            expect((await service.listPerspectives({componentId: workspace.id})).perspective).toEqual({active: 'review', modified: false, pending: null});

            const before  = JSON.stringify(workspace.dockModel),
                  unknown = await service.restorePerspective({componentId: workspace.id, name: 'ghost'});
            expect(unknown.switched).toBe(false);
            expect(unknown.errors[0]).toContain('declares no perspective named "ghost"');
            expect(JSON.stringify(workspace.dockModel)).toBe(before);
            expect(workspace.activePerspective).toBe('review')
        } finally {
            f.destroy()
        }
    });

    test('a name both declared and stored is ambiguous: the restore refuses with nothing moved, and the list shows both sources', async () => {
        const f = fixture(), {workspace} = f,
              layout = Persistence.capturePerspective(f.baseline('operator'), {layoutId: 'snap-1', perspectiveName: 'review', title: 'A snapshot named like a declared perspective'}).layout;

        try {
            await f.settle();
            workspace.perspectiveStore = {
                collection    : {activeLayoutId: 'snap-1'},
                getPerspective: name => name === 'review' || name === 'snap-1' ? {layout, layoutId: 'snap-1'} : null,
                list          : () => [{layoutId: 'snap-1', perspectiveName: 'review', title: layout.title, captureScope: 'window', revision: null}]
            };

            const listed = await service.listPerspectives({componentId: workspace.id});
            expect(listed.declared).toEqual(['operator', 'review']);
            expect(listed.perspectives.map(entry => entry.perspectiveName)).toEqual(['review']);
            expect(listed.activeLayoutId).toBe('snap-1');

            const before  = JSON.stringify(workspace.dockModel),
                  refused = await service.restorePerspective({componentId: workspace.id, name: 'review'});
            expect(refused.switched).toBe(false);
            expect(refused.errors).toEqual(['perspective name "review" is ambiguous across the declared list and the layout collection']);
            expect(JSON.stringify(workspace.dockModel)).toBe(before);
            expect(workspace.activePerspective).toBe('operator');

            // The unambiguous declared name still selects while the store sits beside it.
            const switched = await service.restorePerspective({componentId: workspace.id, name: 'operator'});
            expect(switched).toMatchObject({errors: [], source: 'declared', switched: true})
        } finally {
            f.destroy()
        }
    })
});
