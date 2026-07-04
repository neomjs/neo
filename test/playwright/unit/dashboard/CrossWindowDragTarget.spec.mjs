import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardCrossWindowDragTargetTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

test.describe('Neo.dashboard.CrossWindowDragTarget (#14670 / ADR 0029 §2.3)', () => {
    let CrossWindowDragTarget, DragCoordinator;

    test.beforeAll(async () => {
        CrossWindowDragTarget = (await import('../../../../src/dashboard/CrossWindowDragTarget.mjs')).default;
        DragCoordinator       = (await import('../../../../src/manager/DragCoordinator.mjs')).default;
    });

    test('registers with the coordinator on create and unregisters on destroy', () => {
        const target = Neo.create(CrossWindowDragTarget, {
            sortGroup: 'dock-main',
            windowId : 2
        });

        expect(DragCoordinator.sortZones.get('dock-main').get(2)).toBe(target);

        target.destroy();

        expect(DragCoordinator.sortZones.has('dock-main')).toBe(false)
    });

    test('an incomplete registry identity never registers (§2.3: sortGroup + windowId are mandatory)', () => {
        const target = Neo.create(CrossWindowDragTarget, {
            windowId: 3
        });

        expect(DragCoordinator.sortZones.size).toBe(0);

        target.destroy()
    });

    test('acceptsRemoteDrag is fail-closed without an owner hitTest seam, and delegates with one', () => {
        const target = Neo.create(CrossWindowDragTarget, {
            sortGroup: 'dock-main',
            windowId : 2
        });

        expect(target.acceptsRemoteDrag(10, 10)).toBe(false);

        const seen = [];
        target.hitTest = (x, y) => {seen.push([x, y]); return x < 100};

        expect(target.acceptsRemoteDrag(50, 60)).toBe(true);
        expect(target.acceptsRemoteDrag(150, 60)).toBe(false);
        expect(seen).toEqual([[50, 60], [150, 60]]);

        target.destroy()
    });

    test('the hover path stores the owner-computed preview; leave clears it through the owner seam', () => {
        const cleared = [];
        const target  = Neo.create(CrossWindowDragTarget, {
            clearPreview: () => cleared.push(true),
            previewFor  : payload => payload.localX > 0 ? {feedback: {state: 'accepted'}, itemId: payload.draggedItem.id} : null,
            sortGroup   : 'dock-main',
            windowId    : 2
        });

        const preview = target.onRemoteDragMove({draggedItem: {id: 'pane-a'}, localX: 40, localY: 8});

        expect(preview).toEqual({feedback: {state: 'accepted'}, itemId: 'pane-a'});
        expect(target.currentPreview).toBe(preview);

        target.onRemoteDragLeave();

        expect(target.currentPreview).toBeNull();
        expect(cleared).toEqual([true]);

        target.destroy()
    });

    test('the drop path converts the final preview through the owner previewToOperation → commitOperation pipeline', () => {
        const commits = [];
        const target  = Neo.create(CrossWindowDragTarget, {
            commitOperation   : (operation, draggedItem) => {commits.push({operation, draggedItem}); return {applied: true}},
            previewFor        : () => ({feedback: {state: 'accepted'}, itemId: 'pane-a', placement: {kind: 'tab'}}),
            previewToOperation: preview => ({operation: 'addTab', itemId: preview.itemId, tabsNodeId: 't1', index: null}),
            sortGroup         : 'dock-main',
            windowId          : 2
        });

        target.onRemoteDragMove({draggedItem: {id: 'pane-a'}, localX: 40, localY: 8});

        const result = target.onRemoteDrop({id: 'pane-a', sourceWindowId: 1});

        expect(result).toEqual({applied: true});
        expect(commits).toEqual([{
            operation  : {operation: 'addTab', itemId: 'pane-a', tabsNodeId: 't1', index: null},
            draggedItem: {id: 'pane-a', sourceWindowId: 1}
        }]);
        // the drop consumed the preview — hover state never leaks past the gesture
        expect(target.currentPreview).toBeNull();

        target.destroy()
    });

    test('a drop with no accepted preview, or a converter rejection, commits nothing (fail-closed)', () => {
        const commits = [];
        const target  = Neo.create(CrossWindowDragTarget, {
            commitOperation   : operation => {commits.push(operation); return {applied: true}},
            previewFor        : () => ({feedback: {state: 'rejected'}}),
            previewToOperation: () => null,
            sortGroup         : 'dock-main',
            windowId          : 2
        });

        // no hover at all
        expect(target.onRemoteDrop({id: 'pane-a'})).toBeNull();

        // hover produced a preview the converter rejects (previewToOperation → null)
        target.onRemoteDragMove({draggedItem: {id: 'pane-a'}, localX: 1, localY: 1});
        expect(target.onRemoteDrop({id: 'pane-a'})).toBeNull();

        expect(commits).toEqual([]);
        expect(target.currentPreview).toBeNull();

        target.destroy()
    });
});
