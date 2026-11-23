import {setup} from '../../../setup.mjs';

const appName = 'StateProviderAdvancedUnitTest';

setup({
    neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: true, useDomApiRenderer: true, useVdomWorker: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import '../../../../../src/vdom/util/StringFromVnode.mjs';
import '../../../../../src/vdom/Helper.mjs';
import CompanionSurface           from '../../../../../examples/stateProvider/advanced/CompanionSurface.mjs';
import MainContainer              from '../../../../../examples/stateProvider/advanced/MainContainer.mjs';
import {resolveCompanionOwnerApp} from '../../../../../examples/stateProvider/advanced/app.mjs';

test.beforeEach(() => {
    Neo.ns('Neo.Main', true);
    Neo.Main.getWindowData ??= () => Promise.resolve({innerWidth: 1440, outerWidth: 1440, screenLeft: 0, screenTop: 0});
    Neo.Main.windowFocus   ??= () => Promise.resolve(true);
    Neo.Main.windowOpen    ??= () => Promise.resolve(true);

    Neo.ns('Neo.main.DomAccess', true);
    Neo.main.DomAccess.applyBodyCls  ??= () => {};
    Neo.main.DomAccess.focus         ??= () => {};
    Neo.main.DomAccess.selectNode    ??= () => {};
    Neo.main.DomAccess.setBodyCls    ??= () => {};
    Neo.main.DomAccess.syncModalMask ??= () => {};
    Neo.main.DomAccess.trapFocus     ??= () => {};

    Neo.ns('Neo.main.addon.DragDrop', true);
    Neo.main.addon.DragDrop.setConfigs ??= () => Promise.resolve({})
});

test.describe('examples/stateProvider/advanced surfaces', () => {
    test('edits propagate across header, roster, nested override panel, and open dialog while nested density stays scoped', async () => {
        const view = Neo.create(MainContainer, {appName, windowId: 'win-1'});

        try {
            await view.initVnode();
            view.mounted = true;

            const controller    = view.controller,
                  rootProvider  = view.getStateProvider(),
                  nestedPanel   = controller.getReference('nested-preview-panel'),
                  nestedProv    = nestedPanel.getStateProvider(),
                  headerName    = controller.getReference('header-name'),
                  headerAvatar  = controller.getReference('header-avatar'),
                  headerDensity = controller.getReference('header-density'),
                  inheritedName = controller.getReference('nested-inherited-name'),
                  nestedDensity = controller.getReference('nested-override-density'),
                  formNameField = view.down({name: 'form-name'});

            expect(headerName.text).toBe('Maya Lin');
            expect(headerAvatar.text).toBe('ML');
            expect(headerDensity.text).toBe('Workspace density: Comfortable');
            expect(inheritedName.text).toBe('Maya Lin');
            expect(nestedDensity.text).toBe('Compact');
            expect(nestedProv.getParent()).toBe(rootProvider);

            // Open the floating dialog and verify it binds the same record
            controller.onOpenDialogClick({component: controller.getReference('open-dialog-button')});
            expect(controller.dialog).toBeTruthy();
            await controller.dialog.initVnode();

            const dialogNameField = controller.dialog.down({name: 'dialog-name'});
            expect(dialogNameField.value).toBe('Maya Lin');

            // Edit in the main form -> header, nested panel, store record, and open dialog all update
            formNameField.value = 'Elena Rostova';

            expect(rootProvider.getData('member').name).toBe('Elena Rostova');
            expect(headerName.text).toBe('Elena Rostova');
            expect(headerAvatar.text).toBe('ER');
            expect(inheritedName.text).toBe('Elena Rostova');
            expect(dialogNameField.value).toBe('Elena Rostova');

            // Edit in the dialog -> main form and header follow
            dialogNameField.value = 'Clara Novak';
            expect(formNameField.value).toBe('Clara Novak');
            expect(headerName.text).toBe('Clara Novak');
            expect(headerAvatar.text).toBe('CN');

            // Flip nested override -> only nested panel changes; root workspace density stays Comfortable
            controller.onFlipNestedDensityClick();
            expect(nestedDensity.text).toBe('Comfortable');
            expect(headerDensity.text).toBe('Workspace density: Comfortable');

            // Reset member restores Maya Lin across every surface
            controller.onResetMemberClick();
            expect(headerName.text).toBe('Maya Lin');
            expect(formNameField.value).toBe('Maya Lin');
            expect(dialogNameField.value).toBe('Maya Lin');

            // Popup button visibility tracks viewport popup capability (hidden at 390px, shown at 1440px under SharedWorker)
            const prevShared = Neo.currentWorker.isSharedWorker;
            Neo.currentWorker.isSharedWorker = true;
            try {
                controller.updatePopupCapability(1440);
                expect(controller.getReference('open-window-button').hidden).toBe(false);
                expect(controller.getReference('try-line').text).toContain('launch a second window');

                controller.updatePopupCapability(390);
                expect(controller.getReference('open-window-button').hidden).toBe(true);
                expect(controller.getReference('try-line').text).not.toContain('second window')
            } finally {
                Neo.currentWorker.isSharedWorker = prevShared
            }
        } finally {
            view.destroy()
        }
    });

    test('repeat second-window click uses windowFocus without reopening, and companion reload never adopts an unrelated primary', async () => {
        const prevShared     = Neo.currentWorker.isSharedWorker,
              prevWindowOpen = Neo.Main.windowOpen,
              prevFocus      = Neo.Main.windowFocus,
              prevGetByPath  = Neo.Main.getByPath,
              prevConfigs    = Neo.windowConfigs,
              openCalls      = [],
              focusCalls     = [];

        Neo.currentWorker.isSharedWorker = true;
        Neo.currentWorker.isWindowDeparted ??= () => false;
        Neo.windowConfigs = {
            ...prevConfigs,
            'win-a': {url: {href: 'http://localhost:8080/examples/stateProvider/advanced/index.html'}},
            'win-b': {url: {href: 'http://localhost:8080/examples/stateProvider/advanced/index.html'}}
        };
        Neo.Main.windowOpen  = data => { openCalls.push(data); return Promise.resolve(true) };
        Neo.Main.windowFocus = data => { focusCalls.push(data); return Promise.resolve(true) };

        const viewA        = Neo.create(MainContainer, {appName, windowId: 'win-a'}),
              viewB        = Neo.create(MainContainer, {appName, windowId: 'win-b'}),
              disconnected = Neo.create(CompanionSurface, {
                  appName,
                  stateProvider: {data: CompanionSurface.disconnectedState},
                  windowId     : 'win-disconnected'
              });

        Neo.apps ??= {};
        Neo.apps['win-a'] = {fire: () => {}, isDestroyed: false, mainView: viewA, name: 'Neo.examples.stateProvider.advanced', windowId: 'win-a'};
        Neo.apps['win-b'] = {fire: () => {}, isDestroyed: false, mainView: viewB, name: 'Neo.examples.stateProvider.advanced', windowId: 'win-b'};

        try {
            await viewA.initVnode();
            await viewB.initVnode();
            await disconnected.initVnode();
            viewA.mounted        = true;
            viewB.mounted        = true;
            disconnected.mounted = true;

            // First click opens the named companion popup
            await viewB.controller.onOpenSecondWindowClick();
            expect(openCalls).toHaveLength(1);
            expect(openCalls[0].windowName).toBe(CompanionSurface.windowNameFor('win-b'));
            expect(focusCalls).toHaveLength(0);

            // Simulate the mounted companion bound to win-b -> repeat click focuses instead of calling windowOpen
            Neo.apps['win-comp'] = {
                isDestroyed: false,
                mainView   : {items: [{ownerWindowId: 'win-b'}]},
                name       : 'Neo.examples.stateProvider.advanced.companion',
                windowId   : 'win-comp'
            };

            await viewB.controller.onOpenSecondWindowClick();
            expect(openCalls).toHaveLength(1);
            expect(focusCalls).toEqual([{
                windowId  : 'win-b',
                windowName: CompanionSurface.windowNameFor('win-b')
            }]);

            // Reload without nativeRoute keeps win-b via verified opener + targetName ownership (never adopts win-a)
            Neo.Main.getByPath = ({path, windowId}) => {
                if (windowId === 'win-comp') {
                    if (path === 'name')                           return Promise.resolve('target-uuid-b');
                    if (path === 'opener.closed')                  return Promise.resolve(false);
                    if (path === 'opener.Neo.worker.Manager.windowId') return Promise.resolve('win-b')
                }
                if (windowId === 'win-b' && Array.isArray(path) && path[3] === CompanionSurface.windowNameFor('win-b')) {
                    return Promise.resolve('target-uuid-b')
                }
                return Promise.resolve(undefined)
            };

            const reloadedOwner = await resolveCompanionOwnerApp('win-comp', {nativeRoute: null});
            expect(reloadedOwner).toBe(Neo.apps['win-b']);

            // Unowned / mismatched reload returns null rather than falling back to win-a
            Neo.Main.getByPath = () => Promise.resolve(undefined);
            const unowned = await resolveCompanionOwnerApp('win-comp', {nativeRoute: null});
            expect(unowned).toBeNull();

            // Disconnected surface disables both reset button and fields
            expect(disconnected.getReference('companion-reset-button').disabled).toBe(true);
            expect(disconnected.down({name: 'window-name'}).disabled).toBe(true)
        } finally {
            delete Neo.apps['win-a'];
            delete Neo.apps['win-b'];
            delete Neo.apps['win-comp'];
            disconnected.destroy();
            viewB.destroy();
            viewA.destroy();
            Neo.Main.windowOpen              = prevWindowOpen;
            Neo.Main.windowFocus             = prevFocus;
            Neo.Main.getByPath               = prevGetByPath;
            Neo.windowConfigs                = prevConfigs;
            Neo.currentWorker.isSharedWorker = prevShared
        }
    });

    test('overlapping second-window clicks serialize across pending isWindowOpen probes and release the lock in finally', async () => {
        const prevShared       = Neo.currentWorker.isSharedWorker,
              prevWindowOpen   = Neo.Main.windowOpen,
              prevFocus        = Neo.Main.windowFocus,
              prevIsWindowOpen = CompanionSurface.isWindowOpen,
              prevConfigs      = Neo.windowConfigs,
              openCalls        = [],
              focusCalls       = [],
              pendingProbes    = [];

        let isOpenCalls = 0;

        Neo.currentWorker.isSharedWorker = true;
        Neo.windowConfigs = {
            ...prevConfigs,
            'win-race': {url: {href: 'http://localhost:8080/examples/stateProvider/advanced/index.html'}}
        };
        Neo.Main.windowOpen  = data => { openCalls.push(data); return Promise.resolve(true) };
        Neo.Main.windowFocus = data => { focusCalls.push(data); return Promise.resolve(true) };

        const view = Neo.create(MainContainer, {appName, windowId: 'win-race'});

        try {
            await view.initVnode();
            view.mounted = true;

            // Arm 1: two overlapping clicks while isWindowOpen is pending and resolves false -> single openWindow
            CompanionSurface.isWindowOpen = () => {
                isOpenCalls++;
                return new Promise(resolve => { pendingProbes.push(resolve) })
            };

            const launchA = view.controller.onOpenSecondWindowClick(),
                  launchB = view.controller.onOpenSecondWindowClick();

            pendingProbes.splice(0).forEach(resolve => resolve(false));
            await Promise.all([launchA, launchB]);

            expect(openCalls).toHaveLength(1);
            expect(isOpenCalls).toBe(1);
            expect(focusCalls).toHaveLength(0);

            // Arm 2: two overlapping clicks while isWindowOpen is pending and resolves true -> single focusWindow
            const focusA = view.controller.onOpenSecondWindowClick(),
                  focusB = view.controller.onOpenSecondWindowClick();

            pendingProbes.splice(0).forEach(resolve => resolve(true));
            await Promise.all([focusA, focusB]);

            expect(isOpenCalls).toBe(2);
            expect(openCalls).toHaveLength(1);
            expect(focusCalls).toHaveLength(1);

            // Arm 3: rejection during probe still clears #openingCompanion so a settled follow-up click runs
            CompanionSurface.isWindowOpen = () => Promise.reject(new Error('probe rejected'));
            await expect(view.controller.onOpenSecondWindowClick()).rejects.toThrow('probe rejected');

            CompanionSurface.isWindowOpen = () => Promise.resolve(true);
            await view.controller.onOpenSecondWindowClick();
            expect(focusCalls).toHaveLength(2)
        } finally {
            view.destroy();
            CompanionSurface.isWindowOpen    = prevIsWindowOpen;
            Neo.Main.windowOpen              = prevWindowOpen;
            Neo.Main.windowFocus             = prevFocus;
            Neo.windowConfigs                = prevConfigs;
            Neo.currentWorker.isSharedWorker = prevShared
        }
    })
});
