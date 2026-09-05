import {setup} from '../../setup.mjs';
setup({appConfig: {name: 'DockPlacementTest'}});

import {expect, test}           from '@playwright/test';
import Neo                      from '../../../../src/Neo.mjs';
import * as core                from '../../../../src/core/_export.mjs';
import Transaction              from '../../../../src/manager/Transaction.mjs';
import WindowManager            from '../../../../src/manager/Window.mjs';
import DragCoordinator          from '../../../../src/manager/DragCoordinator.mjs';
import WorkspaceDocument        from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Placement                from '../../../../src/dashboard/dock/window/Placement.mjs';
import {createDockWorkspaceSet} from '../../../../src/dashboard/dock/window/WorkspaceSet.mjs';

/** @summary Creates one item-disjoint, validated dock document. @param {String} key @returns {Object} */
function document(key) {
    return {
        schema: WorkspaceDocument.SCHEMA,
        root  : 'root',
        items : {[key]: {componentRef: key, kind: 'panel'}},
        nodes : {root: {type: 'tabs', items: [key], activeItemId: key}}
    }
}

/** @summary Emits a real window-manager geometry report. @param {String} windowId @param {Number} x @param {Number} y */
function move(windowId, x, y) {
    WindowManager.onWindowPositionChange({windowId, screenLeft: x, screenTop: y, outerWidth: 420, outerHeight: 340, innerWidth: 400, innerHeight: 300})
}

test.describe.serial('Dock relative placement participant', () => {
    let groupId, placement, workspaces, settleMs;
    const mainWindow = 'placement-main-window', popupWindow = 'placement-popup-window';

    test.beforeEach(() => {
        settleMs = DragCoordinator.nativeWindowDropSettleMs;
        DragCoordinator.nativeWindowDropSettleMs = 10;
        ({groupId} = Transaction.bind({windowId: mainWindow, workspaceKey: 'main'}));
        Transaction.setHistoryDepth({groupId, depth: 5});
        const reserved = Transaction.reserve({groupId, workspaceKey: 'popup'});
        Transaction.bind({...reserved, windowId: popupWindow});
        workspaces = createDockWorkspaceSet({manager: Transaction, getGroupId: () => groupId, documentModel: WorkspaceDocument});
        const docs = {'workstation-main': document('main'), popup: document('popup')};
        for (const key of Object.keys(docs)) {
            workspaces.register(key, {getDocument: () => docs[key], setDocument: value => docs[key] = value})
        }
        move(mainWindow, 100, 80);
        move(popupWindow, 500, 300);
        placement = Neo.create(Placement, {groupId, mainWorkspaceKey: 'workstation-main'})
    });

    test.afterEach(() => {
        placement?.destroy();
        Transaction.retireGroup(groupId);
        WindowManager.unregister(mainWindow);
        WindowManager.unregister(popupWindow);
        DragCoordinator.nativeWindowDropSettleMs = settleMs
    });

    test('the hint is relative, frozen and separate from workspace documents', () => {
        expect(placement.hints).toEqual({popup: {dx: 400, dy: 220, fallbackTarget: {workspaceKey: 'workstation-main', nodeId: 'root'}}});
        expect(Object.isFrozen(placement.hints.popup.fallbackTarget)).toBe(true);
        expect(workspaces.ids()).toEqual(['workstation-main', 'popup']);
        expect(workspaces.has('placementHints')).toBe(false);
        expect(workspaces.getDocument('placementHints')).toBeNull();
        expect(() => placement.prepare({'workstation-main': placement.hints.popup})).toThrow(/main workspace/);
        expect(() => placement.prepare({popup: {...placement.hints.popup, windowId: popupWindow}})).toThrow(/unexpected/)
    });

    test('render-host replacement reuses one owner and explicit Group retirement destroys it', () => {
        expect(Placement.forGroup({groupId, mainWorkspaceKey: 'workstation-main'})).toBe(placement);
        Transaction.retireGroup(groupId);
        expect(placement.isDestroyed).toBe(true)
    });

    test('a free popup burst appends one observed before/after row after quiescence', async () => {
        move(popupWindow, 510, 310);
        move(popupWindow, 540, 320);
        move(popupWindow, 560, 350);
        expect(Transaction.get(groupId).history).toBeNull();
        await expect.poll(() => Transaction.get(groupId).history?.count).toBe(1);
        const row = Transaction.get(groupId).history.current;
        expect(row.cause).toBe('native-popup-move');
        expect(row.participants[0].before.popup).toMatchObject({dx: 400, dy: 220});
        expect(row.participants[0].after.popup).toMatchObject({dx: 460, dy: 270});
        expect(placement.hints.popup).toEqual(row.participants[0].after.popup);
        expect(Transaction.get(groupId).snapshot.participants.placementHints).toEqual(placement.hints)
    });

    test('moving the main frame rebases hints and snapshot without changing history or popup geometry', async () => {
        move(popupWindow, 550, 330);
        await expect.poll(() => Transaction.get(groupId).history?.count).toBe(1);
        const group = Transaction.get(groupId), history = JSON.stringify(group.history.toJSON());
        const popup = WindowManager.get(popupWindow).outerRect;
        move(mainWindow, 200, 120);
        await expect.poll(() => placement.hints.popup.dx).toBe(350);
        expect(placement.hints.popup.dy).toBe(210);
        expect(JSON.stringify(group.history.toJSON())).toBe(history);
        expect(WindowManager.get(popupWindow).outerRect).toBe(popup);
        expect(group.snapshot.participants.placementHints.popup).toMatchObject({dx: 350, dy: 210});
        expect(placement.hints).not.toHaveProperty('workstation-main')
    });

    test('one main-frame observation rebases two popup hints in one snapshot and keeps headless hints', async () => {
        let secondDocument = document('second');
        workspaces.register('popup-two', {getDocument: () => secondDocument, setDocument: value => secondDocument = value});
        const reserved = Transaction.reserve({groupId, workspaceKey: 'popup-two'});
        Transaction.bind({...reserved, windowId: 'placement-popup-two'});
        move('placement-popup-two', 700, 400);
        await placement.write(placement.observedHints(), 'placement-baseline', 'preserve');
        move(popupWindow, 560, 350);
        await expect.poll(() => Transaction.get(groupId).history?.count).toBe(1);
        const group   = Transaction.get(groupId), version = group.snapshot.version;
        const history = JSON.stringify(group.history.toJSON());
        move(mainWindow, 150, 100);
        await expect.poll(() => placement.hints['popup-two']?.dx).toBe(550);
        expect(placement.hints.popup).toMatchObject({dx: 410, dy: 250});
        expect(group.snapshot.version).toBe(version + 1);
        expect(JSON.stringify(group.history.toJSON())).toBe(history);
        Transaction.release('placement-popup-two');
        const headless = placement.hints['popup-two'];
        move(mainWindow, 180, 110);
        await expect.poll(() => placement.hints.popup.dx).toBe(380);
        expect(placement.hints['popup-two']).toEqual(headless);
        WindowManager.unregister('placement-popup-two')
    });

    test('a binding generation changing before settle prevents a stale write', async () => {
        move(popupWindow, 560, 350);
        const old = Transaction.getBinding(groupId, 'popup');
        Transaction.release(popupWindow);
        Transaction.bind({groupId, workspaceKey: 'popup', generationToken: old.generationToken, windowId: 'placement-popup-reloaded'});
        await expect.poll(() => placement.lastWrite !== null).toBe(true);
        expect(await placement.lastWrite).toBeNull();
        expect(Transaction.get(groupId).history).toBeNull();
        expect(placement.hints.popup.dx).toBe(400)
    });

    test('undo and redo observe their native effects without recording them again; a later free move still appends', async () => {
        const popup = WindowManager.get(popupWindow);
        popup.nativeRoute = {ownerWindowId: mainWindow, targetWindowId: popupWindow, nativeHandleKey: 'popup-route'};
        popup.capabilities = {position: true};
        placement.readScreen = async () => ({availLeft: 0, availTop: 0, availWidth: 2000, availHeight: 1400});
        placement.readGeometry = async () => WindowManager.get(popupWindow).outerRect;
        placement.moveWindow = async (route, position, nativeEffect) => {
            WindowManager.onWindowPositionChange({
                windowId  : route.targetWindowId, nativeEffect,
                screenLeft: position.x, screenTop: position.y,
                outerWidth: 420, outerHeight: 340, innerWidth: 400, innerHeight: 300
            });
            return true
        };
        move(popupWindow, 600, 400);
        await expect.poll(() => Transaction.get(groupId).history?.count).toBe(1);
        const group = Transaction.get(groupId), row = group.history.current;
        await Transaction.undo({groupId});
        await expect.poll(() => placement.receipts[0]?.status).toBe('applied');
        expect(placement.receipts[0].observed).toEqual({dx: 400, dy: 220});
        expect(group.history.cursor).toBe(-1);
        expect(group.history.canRedo).toBe(true);
        expect(group.history.count).toBe(1);
        expect(group.history.getAt(0)).toBe(row);

        await Transaction.redo({groupId});
        await expect.poll(() => placement.receipts[0]?.observed.dx).toBe(500);
        expect(group.history.count).toBe(1);
        expect(group.history.cursor).toBe(0);
        move(popupWindow, 700, 440);
        await expect.poll(() => group.history.count).toBe(2);
        expect(group.history.current.cause).toBe('native-popup-move');
        expect(group.history.current.participants[0].after.popup).toMatchObject({dx: 600, dy: 360})
    });

    test('clamping uses the usable screen and a refused move records the observed coordinates, never the request', async () => {
        const popup = WindowManager.get(popupWindow);
        popup.nativeRoute = {ownerWindowId: mainWindow, targetWindowId: popupWindow, nativeHandleKey: 'popup-route'};
        popup.capabilities = {position: true};
        placement.readScreen = async () => ({availLeft: 0, availTop: 20, availWidth: 1000, availHeight: 800});
        let requested;
        placement.moveWindow = async (route, position) => { requested = position; return false };
        placement.readGeometry = async () => ({x: 510, y: 310, width: 420, height: 340});
        const hint    = {...placement.hints.popup, dx: 5000, dy: -5000};
        const receipt = await placement.applyHint('popup', hint, {transactionId: 'clamp-test'});
        expect(requested).toEqual({x: 580, y: 20});
        expect(receipt.status).toBe('refused');
        expect(receipt.observed).toEqual({dx: 410, dy: 230});
        expect(receipt).not.toHaveProperty('x');
        expect(receipt).not.toHaveProperty('windowId');

        requested = null;
        placement.readScreen = async () => null;
        const fallback = await placement.applyHint('popup', hint, {transactionId: 'fallback-test'});
        expect(fallback.status).toBe('fallback');
        expect(fallback.fallbackTarget).toEqual({workspaceKey: 'workstation-main', nodeId: 'root'});
        expect(requested).toBeNull()
    });

    test('a native completion from a retired binding cannot update the successor receipt', async () => {
        const popup = WindowManager.get(popupWindow);
        popup.nativeRoute = {ownerWindowId: mainWindow, targetWindowId: popupWindow, nativeHandleKey: 'popup-route'};
        popup.capabilities = {position: true};
        placement.readScreen = async () => ({availLeft: 0, availTop: 0, availWidth: 2000, availHeight: 1400});
        let release, started;
        const entered = new Promise(resolve => started = resolve);
        placement.moveWindow = () => { started(); return new Promise(resolve => release = resolve) };
        placement.readGeometry = async () => { throw new Error('a retired handle must not be read') };
        const pending = placement.applyHint('popup', placement.hints.popup, {transactionId: 'retired-test'});
        await entered;
        const old = Transaction.getBinding(groupId, 'popup');
        Transaction.release(popupWindow);
        Transaction.bind({groupId, workspaceKey: 'popup', generationToken: old.generationToken, windowId: 'placement-popup-reloaded'});
        release(true);
        expect((await pending).status).toBe('stale');
        expect(placement.receipts).toEqual([])
    })
});
