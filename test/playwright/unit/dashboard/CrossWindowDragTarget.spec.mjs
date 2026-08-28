import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardCrossWindowDragTargetTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

test.describe('Neo.dashboard.dock.window.DragTarget (#14670 / ADR 0029 §2.3)', () => {
    let CrossWindowDragTarget, DragCoordinator;

    test.beforeAll(async () => {
        CrossWindowDragTarget = (await import('../../../../src/dashboard/dock/window/DragTarget.mjs')).default;
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

    test('an explicitly licensed target proxy stages, settles, then restores before leave cleanup', async () => {
        const
            draggedItem = {dockItemId: 'pane-a'},
            order       = [];
        const target = Neo.create(CrossWindowDragTarget, {
            awaitDragEmbodiment: payload => {
                order.push('await-proxy');
                return Promise.resolve(payload.draggedItem === draggedItem)
            },
            clearPreview: () => order.push('clear-preview'),
            previewFor  : () => {
                order.push('preview');
                return {feedback: {state: 'accepted'}, itemId: 'pane-a'}
            },
            restoreDragEmbodiment: () => {
                order.push('restore-proxy');
                return true
            },
            sortGroup          : 'dock-main',
            stageDragEmbodiment: () => {
                order.push('stage-proxy');
                return true
            },
            windowId: 2
        });

        target.onRemoteDragMove({
            draggedItem,
            embodyProxy: true,
            localX     : 40,
            localY     : 8
        });
        await expect(target.awaitRemoteDragEmbodiment(draggedItem)).resolves.toBe(true);
        await expect(target.awaitRemoteDragEmbodiment({dockItemId: 'pane-a'}),
            'equal-looking payloads cannot borrow the active generation').resolves.toBe(false);
        target.onRemoteDragLeave();

        expect(order).toEqual([
            'stage-proxy',
            'preview',
            'await-proxy',
            'restore-proxy',
            'clear-preview'
        ]);
        expect(target.currentDragPayload).toBeNull();
        expect(target.currentPreview).toBeNull();

        target.destroy()
    });

    test('native preview is proxy-free, while a missing licensed stage seam fails closed', () => {
        const calls  = [];
        const target = Neo.create(CrossWindowDragTarget, {
            previewFor: payload => {
                calls.push(['preview', payload.embodyProxy]);
                return {feedback: {state: 'accepted'}}
            },
            sortGroup: 'dock-main',
            windowId : 2
        });

        expect(target.onRemoteDragMove({draggedItem: {}, embodyProxy: false})).toEqual({
            feedback: {state: 'accepted'}
        });
        target.onRemoteDragLeave();

        expect(target.onRemoteDragMove({draggedItem: {}, embodyProxy: true})).toBeNull();
        expect(calls).toEqual([['preview', false]]);
        expect(target.currentPreview).toBeNull();

        target.destroy()
    });

    test('a refused stage and a throwing converter both restore the licensed proxy fail-closed', () => {
        const
            restored = [],
            payload  = {
                draggedItem: {dockItemId: 'pane-a'},
                embodyProxy: true,
                localX     : 4,
                localY     : 4
            },
            target = Neo.create(CrossWindowDragTarget, {
                previewFor        : () => ({feedback: {state: 'accepted'}, itemId: 'pane-a'}),
                previewToOperation: () => {
                    throw new Error('converter failed')
                },
                restoreDragEmbodiment: data => restored.push(data.draggedItem.dockItemId),
                sortGroup            : 'dock-main',
                stageDragEmbodiment  : () => false,
                windowId             : 2
            });

        expect(target.onRemoteDragMove(payload)).toBeNull();
        expect(restored).toEqual(['pane-a']);

        target.stageDragEmbodiment = () => true;
        target.onRemoteDragMove(payload);

        expect(() => target.onRemoteDrop(payload.draggedItem)).toThrow('converter failed');
        expect(restored).toEqual(['pane-a', 'pane-a']);
        expect(target.currentDragPayload).toBeNull();
        expect(target.currentPreview).toBeNull();

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

    test('a committed target promotes its exact proxy; a refused target restores it', () => {
        const
            promoted = [],
            restored = [],
            target   = Neo.create(CrossWindowDragTarget, {
                commitOperation      : () => ({applied: true}),
                previewFor           : () => ({feedback: {state: 'accepted'}, itemId: 'pane-a'}),
                previewToOperation   : () => ({operation: 'addTab', itemId: 'pane-a', tabsNodeId: 't1'}),
                promoteDragEmbodiment: payload => promoted.push(payload.draggedItem.dockItemId),
                restoreDragEmbodiment: payload => restored.push(payload.draggedItem.dockItemId),
                sortGroup            : 'dock-main',
                stageDragEmbodiment  : () => true,
                windowId             : 2
            }),
            payload = {
                draggedItem: {dockItemId: 'pane-a'},
                embodyProxy: true,
                localX     : 4,
                localY     : 4
            };

        target.onRemoteDragMove(payload);
        expect(target.onRemoteDrop(payload.draggedItem)).toEqual({applied: true});
        expect(promoted).toEqual(['pane-a']);
        expect(restored).toEqual([]);

        target.commitOperation = () => null;
        target.onRemoteDragMove(payload);
        expect(target.onRemoteDrop(payload.draggedItem)).toBeNull();
        expect(promoted).toEqual(['pane-a']);
        expect(restored).toEqual(['pane-a']);

        target.destroy()
    });

    test('a target destroyed during an async commit never promotes or reports its stale embodiment', async () => {
        const
            promoted = [],
            restored = [];
        let resolveCommit;

        const
            target = Neo.create(CrossWindowDragTarget, {
                commitOperation   : () => new Promise(resolve => resolveCommit = resolve),
                previewFor        : () => ({feedback: {state: 'accepted'}, itemId: 'pane-a'}),
                previewToOperation: () => ({
                    operation : 'addTab',
                    itemId    : 'pane-a',
                    tabsNodeId: 't1'
                }),
                promoteDragEmbodiment: payload => promoted.push(payload.draggedItem.dockItemId),
                restoreDragEmbodiment: payload => restored.push(payload.draggedItem.dockItemId),
                sortGroup            : 'dock-main',
                stageDragEmbodiment  : () => true,
                windowId             : 2
            }),
            payload = {
                draggedItem: {dockItemId: 'pane-a'},
                embodyProxy: true,
                localX     : 4,
                localY     : 4
            };

        target.onRemoteDragMove(payload);

        const dropping = target.onRemoteDrop(payload.draggedItem);

        target.destroy();
        resolveCommit({applied: true});

        expect(await dropping,
            'a completion whose target generation departed must not advertise a source-retiring commit').toBeNull();
        expect(promoted).toEqual([]);
        expect(restored, 'destroy restores the staged generation exactly once').toEqual(['pane-a'])
    });

    test('a target destroyed during an async rejection restores its staged generation exactly once', async () => {
        const restored = [];
        let rejectCommit;

        const
            target = Neo.create(CrossWindowDragTarget, {
                commitOperation   : () => new Promise((resolve, reject) => rejectCommit = reject),
                previewFor        : () => ({feedback: {state: 'accepted'}, itemId: 'pane-a'}),
                previewToOperation: () => ({
                    operation : 'addTab',
                    itemId    : 'pane-a',
                    tabsNodeId: 't1'
                }),
                restoreDragEmbodiment: payload => restored.push(payload.draggedItem.dockItemId),
                sortGroup            : 'dock-main',
                stageDragEmbodiment  : () => true,
                windowId             : 2
            }),
            payload = {
                draggedItem: {dockItemId: 'pane-a'},
                embodyProxy: true,
                localX     : 4,
                localY     : 4
            },
            error = new Error('commit failed after target departure');

        target.onRemoteDragMove(payload);

        const dropping = target.onRemoteDrop(payload.draggedItem);

        target.destroy();
        rejectCommit(error);

        await expect(dropping).rejects.toBe(error);
        expect(restored, 'destroy owns the sole exact-generation restore').toEqual(['pane-a'])
    });

    test('a throwing owner commit still ends the gesture clean — cleanup is unconditional', () => {
        const cleared = [];
        const target  = Neo.create(CrossWindowDragTarget, {
            clearPreview      : () => cleared.push(true),
            commitOperation   : () => {throw new Error('adapter refused the transfer')},
            previewFor        : () => ({feedback: {state: 'accepted'}, itemId: 'pane-a'}),
            previewToOperation: () => ({operation: 'addTab', itemId: 'pane-a', tabsNodeId: 't1', index: null}),
            sortGroup         : 'dock-main',
            windowId          : 2
        });

        target.onRemoteDragMove({draggedItem: {id: 'pane-a'}, localX: 4, localY: 4});

        // the owner's error propagates (its bug to observe) — but hover state never survives it
        expect(() => target.onRemoteDrop({id: 'pane-a'})).toThrow('adapter refused the transfer');
        expect(target.currentPreview).toBeNull();
        expect(cleared).toEqual([true]);

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
