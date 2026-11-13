import {setup} from '../../../setup.mjs';

setup({neoConfig: {allowVdomUpdatesInTests: false}, appConfig: {name: 'WorkstationThemeUnitTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import Container   from '../../../../../src/container/Base.mjs';
import Transaction from '../../../../../src/manager/Transaction.mjs';
import Workspace   from '../../../../../apps/workstation/view/Workspace.mjs';

const light    = 'neo-theme-neo-light', dark = 'neo-theme-neo-dark', explicit = 'neo-theme-cyberpunk';
let   sequence = 0;

/**
 * @summary Owns one public Workstation composition and only the Transaction Group this fixture binds.
 * @param {String} theme
 * @returns {Object} The workspace and its owning cleanup.
 */
function createWorkspace(theme) {
    const windowId  = `workstation-theme-unit-${++sequence}`,
          binding   = Transaction.bind({windowId, workspaceKey: 'main'}),
          workspace = Neo.create(Workspace, {appName: 'WorkstationThemeUnitTest', windowId, theme});

    return {workspace, destroy() {
        workspace.destroy();
        Transaction.retireGroup(binding.groupId)
    }}
}

test.describe('Workstation retained-pane themes', () => {
    test('a projected split retains the pane while the next application theme reaches it and preserves a different explicit scope', async () => {
        const fixture = createWorkspace(dark), {workspace} = fixture;

        try {
            workspace.setWorkspaceTheme(light);
            const pane = workspace.paneCache.scale, custom = workspace.paneCache.metrics;
            custom.theme = explicit;

            const result = workspace.applyDockZoneOperation({operation: 'splitNode', itemId: 'security',
                targetNodeId: 'scale-tabs', orientation: 'vertical', edge: 'bottom', sizes: [0.72, 0.28]});
            expect(result.errors).toEqual([]);
            await workspace.onDockZoneDocumentChange(result.document);
            await workspace.refreshPromise;
            expect(workspace.paneCache.scale).toBe(pane);
            expect(pane.theme).toBe(light);
            expect(custom.theme).toBe(explicit);

            expect(workspace.setWorkspaceTheme(dark)).toBe(dark);
            expect(pane.theme, 'the retained pane follows the application after its projection changed').toBe(dark);
            expect(pane.getTheme()).toBe(dark);
            expect(workspace.paneCache.scale).toBe(pane);
            expect(custom.theme).toBe(explicit)
        } finally {
            fixture.destroy()
        }
    });

    test('an unpresented cached pane follows the application while a destroyed cached pane receives no write', () => {
        const fixture       = createWorkspace(light), {workspace} = fixture;
        let   retiredWrites = 0;

        try {
            const unpresented = workspace.resolvePane('theme-unpresented', {title: 'Unpresented'}),
                  retired     = workspace.resolvePane('theme-retired', {title: 'Retired'});
            expect(unpresented.parent).toBeNull();
            expect(unpresented.theme).toBeNull();
            retired.theme = light;
            retired.destroy();
            // Count attempted writes too: Base normally ignores a late write, hiding an owner that still makes it.
            Object.defineProperty(retired, 'theme', {configurable: true, get: () => light, set: () => {retiredWrites++;}});

            workspace.setWorkspaceTheme(dark);
            expect(retiredWrites).toBe(0);
            expect(retired.isDestroyed).toBe(true);
            expect(workspace.paneCache['theme-unpresented']).toBe(unpresented);
            expect(unpresented.theme).toBe(dark);
            expect(unpresented.getTheme()).toBe(dark)
        } finally {
            fixture.destroy()
        }
    });

    test('the main views of this app follow its theme and another app in the same worker keeps its own', () => {
        const fixture        = createWorkspace(light), {workspace} = fixture,
              main           = Neo.create(Container, {windowId: workspace.windowId, theme: light}),
              popup          = Neo.create(Container, {windowId: workspace.windowId + '-popup', theme: light}),
              foreign        = Neo.create(Container, {windowId: workspace.windowId + '-foreign', theme: light}),
              originalByName = Neo.appsByName, originalApps = Neo.apps;

        try {
            const mainApp = {mainView: main}, popupApp = {mainView: popup}, foreignApp = {mainView: foreign};
            Neo.appsByName = {...originalByName, [workspace.appName]: [mainApp, popupApp], WorkstationThemeOtherApp: [foreignApp]};
            Neo.apps = {...originalApps, [main.windowId]: mainApp, [popup.windowId]: popupApp, [foreign.windowId]: foreignApp};

            expect(workspace.setWorkspaceTheme(dark)).toBe(dark);
            expect([main.theme, popup.theme]).toEqual([dark, dark]);
            expect(foreign.theme).toBe(light)
        } finally {
            Neo.appsByName = originalByName;
            Neo.apps = originalApps;
            main.destroy();
            popup.destroy();
            foreign.destroy();
            fixture.destroy()
        }
    });
});
