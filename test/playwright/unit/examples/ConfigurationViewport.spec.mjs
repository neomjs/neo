import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'WorkbenchTest'}});

import {expect, test}        from '@playwright/test';
import Neo                   from '../../../../src/Neo.mjs';
import * as core             from '../../../../src/core/_export.mjs';
import ConfigurationViewport from '../../../../examples/ConfigurationViewport.mjs';

test.beforeAll(() => {
    Neo.main ??= {};
    Neo.main.DomEvents ??= {
        isSingleton                 : true,
        registerDisabledInputChars  : () => {},
        unregisterDisabledInputChars: () => {}
    };
    if (Neo.main.DomAccess) {
        Neo.main.DomAccess.applyBodyCls ??= () => {};
    }
});
import ButtonMainContainer from '../../../../examples/button/base/MainContainer.mjs';
import FieldMainContainer  from '../../../../examples/form/field/text/MainContainer.mjs';
import ListMainContainer   from '../../../../examples/list/base/MainContainer.mjs';

test.describe('ConfigurationViewport Workbench (Stage, Inspector, Reset, Theme)', () => {
    test('renders stage and inspector with reset button and theme switch', async () => {
        const viewport = Neo.create(ButtonMainContainer, {
            autoMount: false
        });

        expect(viewport.items.length).toBe(2);

        // Stage
        const stage = viewport.items[0];
        expect(stage.cls).toContain('neo-workbench-stage');
        expect(stage.cls).toContain('neo-example-container');
        expect(stage.items[0]).toBe(viewport.exampleComponent);

        // Inspector
        const inspector = viewport.items[1];
        expect(inspector.cls).toContain('neo-workbench-inspector');
        expect(inspector.cls).toContain('neo-configuration-panel');

        // Header toolbar buttons inside Inspector
        const headerToolbar = inspector.items[0];
        const resetBtn      = headerToolbar.items.find(item => item.cls?.includes('neo-button-reset') || item.text === 'Reset');
        const themeBtn      = headerToolbar.items.find(item => item.cls?.includes('neo-button-theme-switch') || item.id?.includes('switchThemeButton'));

        expect(resetBtn).toBeDefined();
        expect(themeBtn).toBeDefined();

        viewport.destroy();
    });

    test('button/base example: config change modifies component and reset restores initial value', async () => {
        const viewport = Neo.create(ButtonMainContainer, {
            autoMount: false
        });

        const initialBadgePosition = viewport.exampleComponent.badgePosition;
        expect(initialBadgePosition).toBe('top-right');

        // Change badgePosition via onRadioChange
        viewport.onRadioChange('badgePosition', 'bottom-left', {value: true});
        expect(viewport.exampleComponent.badgePosition).toBe('bottom-left');

        // Execute reset
        viewport.onReset();
        expect(viewport.exampleComponent.badgePosition).toBe(initialBadgePosition);

        viewport.destroy();
    });

    test('form/field/text example: config change modifies component and reset restores initial value', async () => {
        const viewport = Neo.create(FieldMainContainer, {
            autoMount: false
        });

        const initialDisabled = viewport.exampleComponent.disabled;
        expect(initialDisabled).toBe(false);

        // Change disabled state
        viewport.onConfigChange('disabled', {value: true});
        expect(viewport.exampleComponent.disabled).toBe(true);

        // Execute reset
        viewport.onReset();
        expect(viewport.exampleComponent.disabled).toBe(initialDisabled);

        viewport.destroy();
    });

    test('list/base example: config change modifies component and reset restores initial value', async () => {
        const viewport = Neo.create(ListMainContainer, {
            autoMount: false
        });

        const initialActiveIndex = viewport.exampleComponent.activeIndex;

        // Change activeIndex
        viewport.onConfigChange('activeIndex', {value: 4});
        expect(viewport.exampleComponent.activeIndex).toBe(4);

        // Execute reset
        viewport.onReset();
        expect(viewport.exampleComponent.activeIndex).toBe(initialActiveIndex);

        viewport.destroy();
    });

    test('theme switch cycles through available themes', async () => {
        const viewport = Neo.create(ButtonMainContainer, {
            autoMount: false
        });

        const inspector     = viewport.items[1];
        const headerToolbar = inspector.items[0];
        const themeBtn      = headerToolbar.items.find(item => item.id === viewport.id + '__switchThemeButton');
        expect(themeBtn).toBeDefined();

        const initialText = themeBtn.text;
        viewport.onSwitchTheme({component: themeBtn});
        expect(themeBtn.text).not.toBe(initialText);

        viewport.destroy();
    });
});
