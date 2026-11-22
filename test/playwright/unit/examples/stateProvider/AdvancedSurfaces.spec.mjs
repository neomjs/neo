import {setup}        from '../../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import '../../../../../src/vdom/Helper.mjs';
import MainContainer  from '../../../../../examples/stateProvider/advanced/MainContainer.mjs';

const appName = 'StateProviderAdvancedUnitTest';

setup({
    neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: true, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

test.beforeEach(() => {
    Neo.ns('Neo.Main', true);
    Neo.Main.getWindowData ??= () => Promise.resolve({innerWidth: 1440, outerWidth: 1440, screenLeft: 0, screenTop: 0});
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

                controller.updatePopupCapability(390);
                expect(controller.getReference('open-window-button').hidden).toBe(true)
            } finally {
                Neo.currentWorker.isSharedWorker = prevShared
            }
        } finally {
            view.destroy()
        }
    })
});
