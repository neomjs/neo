import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'WorkbenchTest'}});

import {expect, test}        from '@playwright/test';
import Neo                   from '../../../../src/Neo.mjs';
import * as core             from '../../../../src/core/_export.mjs';
import ConfigurationViewport from '../../../../examples/ConfigurationViewport.mjs';

let origDomEvents;
let origApplyBodyCls;
let origSetBodyCls;
let hadDomEvents;
let hadDomAccess;
let hadApplyBodyCls;
let hadSetBodyCls;

test.beforeAll(() => {
    Neo.main ??= {};
    hadDomEvents  = 'DomEvents' in Neo.main;
    origDomEvents = Neo.main.DomEvents;
    Neo.main.DomEvents ??= {
        isSingleton                 : true,
        registerDisabledInputChars  : () => {},
        unregisterDisabledInputChars: () => {}
    };

    hadDomAccess = 'DomAccess' in Neo.main;
    Neo.main.DomAccess ??= {};

    hadApplyBodyCls  = 'applyBodyCls' in Neo.main.DomAccess;
    origApplyBodyCls = Neo.main.DomAccess.applyBodyCls;
    Neo.main.DomAccess.applyBodyCls ??= () => {};

    hadSetBodyCls  = 'setBodyCls' in Neo.main.DomAccess;
    origSetBodyCls = Neo.main.DomAccess.setBodyCls;
    Neo.main.DomAccess.setBodyCls ??= async () => {};
});

test.afterAll(() => {
    if (Neo.main) {
        if (hadDomEvents) {
            Neo.main.DomEvents = origDomEvents;
        } else {
            delete Neo.main.DomEvents;
        }

        if (Neo.main.DomAccess) {
            if (hadApplyBodyCls) {
                Neo.main.DomAccess.applyBodyCls = origApplyBodyCls;
            } else {
                delete Neo.main.DomAccess.applyBodyCls;
            }

            if (hadSetBodyCls) {
                Neo.main.DomAccess.setBodyCls = origSetBodyCls;
            } else {
                delete Neo.main.DomAccess.setBodyCls;
            }

            if (!hadDomAccess && Object.keys(Neo.main.DomAccess).length === 0) {
                delete Neo.main.DomAccess;
            }
        }
    }
});

import ButtonMainContainer     from '../../../../examples/button/base/MainContainer.mjs';
import FieldMainContainer      from '../../../../examples/form/field/text/MainContainer.mjs';
import ListMainContainer       from '../../../../examples/list/base/MainContainer.mjs';
import GridMainContainer       from '../../../../examples/grid/valueBanding/MainContainer.mjs';
import FunctionalMainContainer from '../../../../examples/functional/hostComponent/MainContainer.mjs';

test.describe('ConfigurationViewport Workbench (Stage, Inspector, Reset, Theme)', () => {
    test('renders stage and inspector with reset button and theme switch', async () => {
        const viewport = Neo.create(ButtonMainContainer, {
            autoMount: false
        });

        expect(viewport.items.length).toBe(2);

        // Stage
        const stage = viewport.items[0];
        expect(stage.cls).toContain('neo-workbench-stage');
        expect(stage.cls).not.toContain('neo-example-container');
        expect(stage.items).toHaveLength(2);

        const exampleContainer = stage.items[1];
        expect(exampleContainer.cls).toContain('neo-example-container');
        expect(exampleContainer.items).toEqual([viewport.exampleComponent]);
        expect(viewport.exampleComponent.parentId).toBe(exampleContainer.id);

        // Stage Header
        const stageTitle = stage.down({reference: 'stage-title'});
        expect(stageTitle).toBeDefined();
        expect(stageTitle.text).toBe('Button');

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

    test('stage title names the component a visitor recognises', async () => {
        const viewport = Neo.create(ButtonMainContainer, {autoMount: false});

        try {
            expect(viewport.getComponentName('Neo.button.Base')).toBe('Button');
            expect(viewport.getComponentName('Neo.list.Base')).toBe('List');
            expect(viewport.getComponentName('Neo.grid.Container')).toBe('Grid');
            expect(viewport.getComponentName('Neo.form.field.Text')).toBe('Text');
            expect(viewport.getComponentName('Neo.Foo')).toBe('Foo');

            viewport.componentName = 'Custom';
            expect(viewport.getComponentName('Neo.button.Base')).toBe('Custom');
        } finally {
            viewport.destroy();
        }
    });

    test('reset snapshots only inspector-controlled configs, never the creation config', async () => {
        const viewport = Neo.create(GridMainContainer, {autoMount: false});

        try {
            const initialHeight = viewport.exampleComponent.height,
                  store         = viewport.exampleComponent.store,
                  columns       = viewport.exampleComponent.columns;

            viewport.onConfigChange('height', {value: 300});
            expect(viewport.exampleComponent.height).toBe(300);

            viewport.onReset();

            expect(viewport.exampleComponent.height).toBe(initialHeight);
            expect(viewport.exampleComponent.store).toBe(store);
            expect(viewport.exampleComponent.columns).toBe(columns);

            const keys = Object.keys(viewport.initialConfigValues);

            expect(keys).toEqual(['height']);
            ['store', 'columns', 'body', 'module', 'columnDefaults', 'wrapperStyle'].forEach(key => {
                expect(keys).not.toContain(key)
            });
        } finally {
            viewport.destroy();
        }
    });

    test('applies exampleContainerConfig only to the example container without mutating its style', async () => {
        const style = {padding: '12px', overflow: 'hidden'},
              viewport = Neo.create(ButtonMainContainer, {
                  autoMount: false,
                  exampleContainerConfig: {
                      layout   : 'fit',
                      reference: 'custom-example-container',
                      style
                  }
              });

        try {
            const stage = viewport.items[0],
                  exampleContainer = stage.items[1];

            expect(stage.reference).not.toBe('custom-example-container');
            expect(exampleContainer.reference).toBe('custom-example-container');
            expect(exampleContainer.layout.ntype).toBe('layout-fit');
            expect(exampleContainer.style).toMatchObject(style);
            expect(exampleContainer.items).toEqual([viewport.exampleComponent]);
            expect(viewport.exampleContainerConfig.style).toEqual(style);
        } finally {
            viewport.destroy();
        }
    });

    test('initial theme connects to Portal default (neo-theme-neo-dark)', async () => {
        const prevThemes = Neo.config.themes;
        Neo.config.themes = ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-light', 'neo-theme-dark'];

        const viewport = Neo.create(FieldMainContainer, {
            autoMount: false
        });

        expect(viewport.theme).toBe('neo-theme-neo-dark');
        expect(viewport.exampleComponent.theme).toBe('neo-theme-neo-dark');

        viewport.destroy();
        Neo.config.themes = prevThemes;
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
        expect(viewport.exampleComponent.labelText).toBe('Project name');
        expect(labelField.value).toBe('Project name');

        // User edits labelText to "Changed field label"
        labelField.value = 'Changed field label';
        viewport.onConfigChange('labelText', {value: 'Changed field label'});
        expect(viewport.exampleComponent.labelText).toBe('Changed field label');
        expect(labelField.value).toBe('Changed field label');

        // Execute reset
        viewport.onReset();

        // Both example component and inspector input are restored
        expect(viewport.exampleComponent.labelText).toBe('Project name');
        expect(labelField.value).toBe('Project name');

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

    test('functional/hostComponent: mounts async controls and captures reset state', async () => {
        const viewport = Neo.create(FunctionalMainContainer, {
            autoMount: false
        });

        // Wait for createConfigurationComponents microtasks and timeout
        await new Promise(resolve => setTimeout(resolve, 50));

        const textField = viewport.down({labelText: 'Button Text'});
        expect(textField).toBeDefined();

        // Edit control value
        textField.value = 'New Button Text';
        expect(textField.value).toBe('New Button Text');

        // Execute reset
        viewport.onReset();
        expect(textField.value).toBe('Click Me (Neo Button)');

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
