import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';
import Workspace    from '../../../../src/dashboard/dock/Workspace.mjs';
import WorkspaceSet from '../../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import Authoring    from '../../../../src/dashboard/dock/model/Authoring.mjs';
import Document     from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Operations   from '../../../../src/dashboard/dock/model/Operations.mjs';
import Transaction  from '../../../../src/manager/Transaction.mjs';

setup({appConfig: {name: 'DockPerspectiveDocumentsTest'}});

const panes = {editor: {ntype: 'component'}, preview: {ntype: 'component'}};

/** @summary The shipped arrangement as an already-lowered document, built through the model tier. */
function shippedDocument() {
    const {document, errors} = Authoring.fromZones(panes, {center: ['editor', 'preview']});

    expect(errors).toEqual([]);

    return document
}

test('a document-valued perspective is its baseline byte-for-byte, with no panes catalog', () => {
    const shipped   = shippedDocument(),
          workspace = Neo.create(Workspace, {enableDockMaximizeAction: false, perspectives: {shipped}, stateProvider: {data: {}}});

    try {
        expect(workspace.activePerspective).toBe('shipped');
        expect(workspace.perspectiveSelection.document('shipped')).toEqual(shipped);
        expect(workspace.dockModel, 'a host that supplies nothing starts from the declared document').toEqual(shipped);
        expect(workspace.getState('dock.perspective')).toEqual({active: 'shipped', modified: false, pending: null})
    } finally {workspace.destroy()}
});

test('an invalid declared document fails capture with its own field path', () => {
    const broken = {...shippedDocument(), items: []};

    expect(() => Neo.create(Workspace, {enableDockMaximizeAction: false, perspectives: {broken}}))
        .toThrow(/perspectives\.broken: .*document\.items/)
});

test('a map mixing zones and documents keeps each declaration by kind', () => {
    const shipped   = shippedDocument(),
          zoned     = {center: ['preview', 'editor']},
          workspace = Neo.create(Workspace, {
              enableDockMaximizeAction: false,
              panes,
              perspectives     : {zoned, shipped},
              activePerspective: 'zoned'
          });

    try {
        expect(workspace.perspectiveSelection.document('shipped')).toEqual(shipped);
        expect(workspace.perspectiveSelection.document('zoned')).toEqual(Authoring.fromZones(panes, zoned).document);
        expect(workspace.dockModel).toEqual(workspace.perspectiveSelection.document('zoned'))
    } finally {workspace.destroy()}
});

test('a Group-bound host keeps its supplied document while a declared baseline holds a pane its sibling owns', async () => {
    const shipped  = shippedDocument(),
          empty    = {schema: Document.SCHEMA, root: 'root', items: {}, nodes: {
              root        : {type: 'edge-zone', zones: {center: {nodeId: 'popup-tabs'}}},
              'popup-tabs': {type: 'tabs', items: []}
          }},
          moved    = Operations.transferItem(shipped, empty, {
              itemId           : 'preview',
              sourceWorkspaceId: 'main',
              targetWorkspaceId: 'popup',
              target           : {operation: 'addTab', tabsNodeId: 'popup-tabs', index: 0}
          }),
          windowId = `perspective-documents-${Neo.getId('test')}`,
          binding  = Transaction.bind({windowId, workspaceKey: 'main'}),
          set      = Neo.create(WorkspaceSet, {manager: Transaction, getGroupId: () => binding.groupId, documentModel: Document});

    expect(moved.errors).toEqual([]);

    let popup = moved.targetDocument, workspace = null;

    try {
        set.register('popup', {getDocument: () => popup, setDocument: value => popup = value});

        // The saved topology is supplied, exactly as a cold boot supplies it; the shipped document is
        // only declared. Registering the shipped document instead is what the single-owner check refuses.
        workspace = Neo.create(Workspace, {
            windowId,
            enableDockMaximizeAction: false,
            dockModel               : moved.sourceDocument,
            perspectives            : {shipped},
            activePerspective       : 'shipped',
            stateProvider           : {data: {}}
        });
        workspace.workspaceKey = 'main';
        workspace.workspaceSet = set;
        set.register('main', {
            componentId: workspace.id,
            getDocument: () => workspace.dockModel,
            setDocument: value => workspace.dockModel = value,
            project    : context => workspace.projectDockCommit(context)
        });

        await Transaction.write({
            cause       : 'cold-hydrate',
            changes     : [{workspaceKey: 'main', input: moved.sourceDocument}, {workspaceKey: 'popup', input: popup}],
            cursorAction: 'preserve',
            descriptor  : {operation: 'hydrateTopology', layoutId: 'saved'},
            groupId     : binding.groupId,
            provenance  : {source: 'cold-hydrate'}
        });
        await workspace.refreshPromise;

        expect(workspace.dockModel.items.preview, 'the registered document leaves the pane with its sibling').toBeUndefined();
        expect(popup.items.preview).toBeTruthy();
        expect(workspace.perspectiveSelection.document('shipped').items.preview, 'the unregistered baseline still holds it').toBeTruthy();
        expect(workspace.getState('dock.perspective')).toEqual({active: 'shipped', modified: true, pending: null})
    } finally {
        set.destroy();
        workspace && !workspace.isDestroyed && workspace.destroy();
        Transaction.retireGroup(binding.groupId)
    }
});
