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
    Neo.main.DomAccess ??= {};
    Neo.main.DomAccess.applyBodyCls ??= () => {};
    Neo.main.DomAccess.setBodyCls   ??= async () => {};
});

test.afterAll(() => {
    if (Neo.main) {
        delete Neo.main.DomEvents;
        delete Neo.main.DomAccess?.applyBodyCls;
        delete Neo.main.DomAccess?.setBodyCls;
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

    test('initial theme connects to Portal default (neo-theme-neo-dark)', async () => {
        const viewport = Neo.create(FieldMainContainer, {
            autoMount: false
        });

        expect(viewport.theme).toBe('neo-theme-neo-dark');
        expect(viewport.exampleComponent.theme).toBe('neo-theme-neo-dark');

        viewport.destroy();
    });

    test('button/base: choose badge position bottom-left, reset restores example and inspector control', async () => {
        const viewport = Neo.create(ButtonMainContainer, {
            autoMount: false
        });

        const initialBadgePosition = viewport.exampleComponent.badgePosition;
        expect(initialBadgePosition).toBe('top-right');

        const radioBottomLeft = viewport.down({valueLabel: 'bottom-left'});
        const radioTopRight   = viewport.down({valueLabel: 'top-right'});

        expect(radioTopRight.checked).toBe(true);
        expect(radioBottomLeft.checked).toBe(false);

        // User chooses badge position bottom-left
        radioBottomLeft.checked = true;
        viewport.onRadioChange('badgePosition', 'bottom-left', {value: true});
        expect(viewport.exampleComponent.badgePosition).toBe('bottom-left');
        expect(radioBottomLeft.checked).toBe(true);

        // Execute reset
        viewport.onReset();

        // Both example component and inspector radio are restored
        expect(viewport.exampleComponent.badgePosition).toBe('top-right');
        expect(radioTopRight.checked).toBe(true);
        expect(radioBottomLeft.checked).toBe(false);

        viewport.destroy();
    });

    test('form/field/text: edit labelText, reset restores example and inspector control', async () => {
        const viewport = Neo.create(FieldMainContainer, {
            autoMount: false
        });

        const labelField = viewport.down({labelText: 'labelText'});
        expect(labelField).toBeDefined();
        expect(viewport.exampleComponent.labelText).toBe('Label');
        expect(labelField.value).toBe('Label');

        // User edits labelText to "Changed field label"
        labelField.value = 'Changed field label';
        viewport.onConfigChange('labelText', {value: 'Changed field label'});
        expect(viewport.exampleComponent.labelText).toBe('Changed field label');
        expect(labelField.value).toBe('Changed field label');

        // Execute reset
        viewport.onReset();

        // Both example component and inspector input are restored
        expect(viewport.exampleComponent.labelText).toBe('Label');
        expect(labelField.value).toBe('Label');

        viewport.destroy();
    });

    test('list/base: edit width from 100 to 180, reset restores example and inspector control', async () => {
        const viewport = Neo.create(ListMainContainer, {
            autoMount: false
        });

        const widthField = viewport.down({labelText: 'width'});
        expect(widthField).toBeDefined();
        expect(viewport.exampleComponent.width).toBe(100);
        expect(widthField.value).toBe(100);

        // User edits width to 180
        widthField.value = 180;
        viewport.onConfigChange('width', {value: 180});
        expect(viewport.exampleComponent.width).toBe(180);
        expect(widthField.value).toBe(180);

        // Execute reset
        viewport.onReset();

        // Both example component and inspector spinbutton are restored
        expect(viewport.exampleComponent.width).toBe(100);
        expect(widthField.value).toBe(100);

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
