import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'DashboardDockWorkspaceAuthoringTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';
import Workspace from '../../../../src/dashboard/dock/Workspace.mjs';
import Authoring from '../../../../src/dashboard/dock/model/Authoring.mjs';
import Container from '../../../../src/container/Base.mjs';
import Rail      from '../../../../src/dashboard/dock/interaction/Rail.mjs';

/** @summary A basic consumer contributes only normal component and dock declarations. */
class DeclaredWorkspace extends Workspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockWorkspaceAuthoring.DeclaredWorkspace',
        layout   : {ntype: 'vbox', align: 'stretch'},
        panes    : {
            editor: {ntype: 'component', text: 'Initial editor', header: {text: 'Editor'}},
            second: {ntype: 'component', text: 'Second editor', header: {text: 'Second'}}
        },
        zones: {center: ['editor', 'second']}
    }
}

DeclaredWorkspace = Neo.setupClass(DeclaredWorkspace);

/** @summary Effective declarations may be computed after the container has constructed. */
class ComputedWorkspace extends DeclaredWorkspace {
    static config = {className: 'Test.Unit.Dashboard.DockWorkspaceAuthoring.ComputedWorkspace'}

    /** @summary Computes the initial arrangement after the complete parent construction. */
    onConstructed() {
        super.onConstructed();
        this.zones = {center: 'second'}
    }
}

ComputedWorkspace = Neo.setupClass(ComputedWorkspace);

test.describe('Workspace initial pane declarations', () => {
    let workspace;

    test.afterEach(() => workspace?.destroy());

    test('literal declarations seed the document before any projection', () => {
        workspace = Neo.create(DeclaredWorkspace);
        expect(workspace.getDockZoneDocument()).toEqual(Authoring.fromZones(workspace.panes, workspace.zones).document);
        expect(workspace.items).toHaveLength(0);
        expect(workspace.refreshPromise).toBeNull();
        expect(workspace.resolvePane('editor', workspace.dockModel.items.editor).text).toBe('Initial editor')
    });

    test('the effective values include computation after super.onConstructed', () => {
        workspace = Neo.create(ComputedWorkspace);
        expect(workspace.dockModel.nodes['tabs-second'].items).toEqual(['second'])
    });

    test('a supplied valid document wins over even invalid default zones', () => {
        const saved = Authoring.fromZones(DeclaredWorkspace.config.panes, {center: 'second'}).document;
        workspace = Neo.create(DeclaredWorkspace, {dockModel: saved, zones: {center: 'unknown'}});
        expect(workspace.dockModel).toEqual(saved);
        expect(workspace.resolvePane('editor', saved.items.editor).text).toBe('Initial editor')
    });

    test('later replacement or mutation of declarations cannot change the captured seed', () => {
        const panes = Neo.clone(DeclaredWorkspace.config.panes, true, true);
        workspace = Neo.create(DeclaredWorkspace, {panes});
        const document = workspace.dockModel;
        workspace.panes.editor.text = 'mutated';
        workspace.set({panes: {editor: {ntype: 'component', text: 'replacement'}}, zones: 'second'});
        expect(workspace.dockModel).toBe(document);
        expect(workspace.resolvePane('editor', document.items.editor).text).toBe('Initial editor');
        expect(workspace.refreshPromise).toBeNull()
    });

    test('normal Container creation resolves distinct declarations of the same class', () => {
        workspace = Neo.create(DeclaredWorkspace);
        const host  = Neo.create(Container), document = workspace.dockModel;
        const first = host.add(workspace.resolvePane('editor', document.items.editor)),
              second = host.add(workspace.resolvePane('second', document.items.second));
        first.text = 'instance state';
        expect(first).not.toBe(second);
        expect(first.id).not.toBe(second.id);
        expect(workspace.resolvePane('editor', document.items.editor)).toBe(first);
        expect(second.text).toBe('Second editor');
        host.remove(first, false);
        expect(workspace.resolveRevealPane('editor', document.items.editor)).toBe(first);
        workspace.destroy();
        expect(first.isDestroyed).toBe(true);
        expect(second.isDestroyed).toBe(true);
        workspace = null;
        host.destroy()
    });

    test('invalid declaration and supplied documents fail before any shell mounts', () => {
        for (const [config, message] of [
            [{zones: {center: 'missing'}}, 'unknown pane "missing"'],
            [{panes: {editor: {id: 'shared-pane'}, second: {id: 'shared-pane'}}}, 'panes.second.id: already in use'],
            [{dockModel: {}}, 'dockModel:'],
            [{dockModel: {schema: 'neo.dock.zone.v1', items: {}, nodes: null, root: 'root'}}, 'dockModel:']
        ]) {
            const id = Neo.getId('invalid-dock-authoring');
            try {
                expect(() => Neo.create(DeclaredWorkspace, {...config, id})).toThrow(message);
                expect(Neo.get(id)?.items).toHaveLength(0)
            } finally {
                Neo.get(id)?.destroy()
            }
        }
    });

    test('the existing recreate transaction adopts a fresh declared identity after success', () => {
        workspace = Neo.create(DeclaredWorkspace);
        const host  = Neo.create(Container), document = workspace.dockModel,
              first = host.add(workspace.resolvePane('editor', document.items.editor));
        first.text = 'instance state';
        const result = workspace.recreateDockPane('editor', first);
        expect(result.errors).toEqual([]);
        expect(first.isDestroyed).toBe(true);
        expect(result.pane.text).toBe('Initial editor');
        expect(workspace.resolvePane('editor', document.items.editor)).toBe(result.pane);
        expect(workspace.retainDeclaredPane(result.pane, 'editor')).toBe(true);
        expect(workspace.dockModel).toBe(document);
        host.destroy()
    });

    test('open refuses unknown and already cataloged declarations without scheduling a projection', async () => {
        workspace = Neo.create(DeclaredWorkspace);
        const before = workspace.dockModel;
        expect((await workspace.openPane('editor')).errors).toEqual(['item "editor" already exists or is reserved']);
        expect((await workspace.openPane('missing')).errors).toEqual(['unknown declared pane "missing"']);
        expect((await workspace.openPane('constructor')).errors).toEqual(['unknown declared pane "constructor"']);
        expect(workspace.dockModel).toBe(before);
        expect(workspace.refreshPromise).toBeNull()
    });

    test('rail release and chrome destruction preserve Workspace-owned panes until close', async () => {
        workspace = Neo.create(DeclaredWorkspace);
        const document = workspace.dockModel,
              makeRail = () => Neo.create(Rail, {
                  dockZoneDocument   : document,
                  edge               : 'right',
                  railItems          : [{dockEdge: 'right', dockItemId: 'editor', restorable: true, title: 'Editor'}],
                  resolveComponentRef: (ref, item, itemId) => workspace.resolvePane(itemId, item),
                  retainRevealPane   : workspace.retainDeclaredPane.bind(workspace)
              });
        let rail = makeRail();
        rail.onTabClick({component: rail.items[0]});
        const pane = rail.revealOverlay.paneSlot.items[0];
        pane.text = 'retained state';
        await rail.releaseRevealPane('editor');
        expect(pane.isDestroyed).not.toBe(true);
        expect(workspace.resolvePane('editor', document.items.editor)).toBe(pane);
        rail.destroy();

        rail = makeRail();
        rail.onTabClick({component: rail.items[0]});
        expect(rail.revealOverlay.paneSlot.items[0]).toBe(pane);
        rail.destroy();
        expect(pane.isDestroyed).not.toBe(true);
        expect(pane.text).toBe('retained state');
        workspace.releaseDeclaredPanes({items: {}});
        expect(pane.isDestroyed).toBe(true)
    });
});
