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
import Store                   from '../../../../src/data/Store.mjs';
import * as formatConfig       from '../../../../examples/workbench/formatConfig.mjs';

const {formatExampleCode} = formatConfig;

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

    test('code view renders module only at initial state and evaluates as valid Neo config', async () => {
        const viewport = Neo.create(ButtonMainContainer, {autoMount: false});

        try {
            const expected = '{\n    module: Neo.button.Base\n}';
            const codeView = viewport.down({reference: 'code-output'});

            expect(viewport.getCodeText()).toBe(expected);
            expect(codeView.vdom.cn[0].cn[0].text).toBe(expected);
            expect(codeView.vdom.cn[1].value).toBe(expected);
            expect(codeView.vdom.cn[1].text).toBe(expected);

            ['menu', 'handler', 'flex', 'cls', 'wrapperStyle'].forEach(excluded => {
                expect(viewport.getCodeText()).not.toContain(`${excluded}:`);
            });

            const parsed = new Function('Neo', 'return ' + viewport.getCodeText())(Neo);
            expect(parsed.module).toBe(Neo.button.Base);
            expect(Object.keys(parsed)).toEqual(['module']);

            const created = Neo.create(parsed);
            expect(created.className).toBe('Neo.button.Base');
            created.destroy();
        } finally {
            viewport.destroy();
        }
    });

    test('code view updates live across inspector handlers, reactive observeConfig, and empties on reset', async () => {
        const viewport = Neo.create(ButtonMainContainer, {autoMount: false});

        try {
            viewport.onRadioChange('badgePosition', 'bottom-left', {value: true});
            viewport.onConfigChange('text', {value: "It's live"});
            viewport.onConfigChange('width', {value: 220});
            viewport.onConfigChange('rippleEffectDuration', {value: 500});
            // Simulates overridden onConfigRecordChange mutating a tracked reactive config directly
            viewport.exampleComponent.ui = 'secondary';

            const code = viewport.getCodeText();

            expect(code).toContain('module');
            expect(code).toContain("badgePosition       : 'bottom-left'");
            expect(code).toContain("text                : 'It\\'s live'");
            expect(code).toContain('width               : 220');
            expect(code).toContain('rippleEffectDuration: 500');
            expect(code).toContain("ui                  : 'secondary'");
            expect(code).not.toContain('cls');
            expect(code).not.toContain('wrapperStyle');

            const parsed = new Function('Neo', 'return ' + code)(Neo);
            expect(parsed).toEqual({
                badgePosition       : 'bottom-left',
                module              : Neo.button.Base,
                rippleEffectDuration: 500,
                text                : "It's live",
                ui                  : 'secondary',
                width               : 220
            });

            // Reverting one config removes only that entry from the diff
            viewport.onConfigChange('width', {value: viewport.initialConfigValues.width});
            expect(viewport.getCodeText()).not.toContain('width');
            expect(viewport.getCodeText()).toContain('badgePosition');

            // Reset restores initial state and empties changed keys
            viewport.onReset();
            expect(viewport.getCodeText()).toBe('{\n    module: Neo.button.Base\n}');
            expect(viewport.down({reference: 'code-output'}).vdom.cn[0].cn[0].text).toBe('{\n    module: Neo.button.Base\n}');
        } finally {
            viewport.destroy();
        }
    });

    test('onCopyCode selects hidden clipboard textarea and executes copy command matching component configs', async () => {
        const viewport    = Neo.create(ButtonMainContainer, {autoMount: false});
        const codePanel   = viewport.down({reference: 'code-panel'});
        const origSelect  = Neo.main.DomAccess.selectNode;
        const origExec    = Neo.main.DomAccess.execCommand;
        const origFocus   = Neo.main.DomAccess.focus;
        const selectCalls = [];
        const execCalls   = [];

        Neo.main.DomAccess.selectNode  = data => { selectCalls.push(data); return data; };
        Neo.main.DomAccess.execCommand = data => { execCalls.push(data);   return data; };
        Neo.main.DomAccess.focus       = () => {};

        try {
            viewport.onConfigChange('text', {value: 'Copy target'});

            const expected = viewport.getCodeText();

            await viewport.onCopyCode();

            expect(codePanel.code).toBe(expected);
            expect(selectCalls).toEqual([{
                appName : codePanel.appName,
                end     : expected.length,
                id      : codePanel.getClipboardId(),
                start   : 0,
                windowId: codePanel.windowId
            }]);
            expect(execCalls).toEqual([{
                appName : codePanel.appName,
                command : 'copy',
                windowId: codePanel.windowId
            }]);
            expect(codePanel.lastCopiedCode).toBe(expected);
            expect(viewport.down({reference: 'code-output'}).vdom.cn[1].value).toBe(expected);
        } finally {
            if (origSelect) Neo.main.DomAccess.selectNode  = origSelect; else delete Neo.main.DomAccess.selectNode;
            if (origExec)   Neo.main.DomAccess.execCommand = origExec;   else delete Neo.main.DomAccess.execCommand;
            if (origFocus)  Neo.main.DomAccess.focus       = origFocus;  else delete Neo.main.DomAccess.focus;
            viewport.destroy();
        }
    });

    test('formatExampleCode omits functions and Neo instances with comment lines and keeps code evaluable', () => {
        const store = Neo.create(Store, {autoLoad: false});

        try {
            const code = formatExampleCode('Neo.grid.Container', {
                height  : 420,
                renderer: value => String(value),
                store,
                nested  : {onClick: () => {}}
            });

            expect(code).toContain('module: Neo.grid.Container');
            expect(code).toContain('height: 420');
            expect(code).toContain('    // renderer: a function, not shown');
            expect(code).toContain('    // store: a Neo.data.Store instance, not shown');
            expect(code).toContain('    // nested: contains non-literal values, not shown');
            expect(code).not.toContain('() => {}');
            expect(code).not.toContain('store   : Neo.data.Store');

            const parsed = new Function('Neo', 'return ' + code)(Neo);
            expect(parsed).toEqual({
                height: 420,
                module: Neo.grid.Container
            });

            const fnOnly = formatExampleCode('Neo.button.Base', {
                formatter: value => value
            });
            expect(fnOnly).toBe('{\n    module: Neo.button.Base\n    // formatter: a function, not shown\n}');
            expect(new Function('Neo', 'return ' + fnOnly)(Neo)).toEqual({module: Neo.button.Base});
        } finally {
            store.destroy();
        }
    });

    test('serializeConfigParams and parseConfigParams round-trip typed literals and reject unsafe or malformed entries', () => {
        const store = Neo.create(Store, {autoLoad: false});

        try {
            expect(typeof formatConfig.serializeConfigParams).toBe('function');
            expect(typeof formatConfig.parseConfigParams).toBe('function');

            const encoded = formatConfig.serializeConfigParams({
                width        : 220,
                badgePosition: 'bottom-left',
                disabled     : true,
                useRipple    : false,
                height       : null,
                numericText  : '42',
                boolText     : 'true',
                nullText     : 'null',
                bracketText  : '[Draft]',
                emptyText    : '',
                tags         : ['alpha', 2],
                meta         : {dense: true},
                skipFn       : () => {},
                skipStore    : store,
                skipNaN      : Number.NaN
            }, ConfigurationViewport.internalExampleConfigs);

            expect(encoded).toContain('badgePosition=bottom-left');
            expect(encoded).toContain('disabled=true');
            expect(encoded).toContain('height=null');
            expect(encoded).toContain('width=220');
            expect(encoded).not.toContain('skipFn');
            expect(encoded).not.toContain('skipStore');
            expect(encoded).not.toContain('skipNaN');

            expect(formatConfig.parseConfigParams(encoded, ConfigurationViewport.internalExampleConfigs)).toEqual({
                badgePosition: 'bottom-left',
                boolText     : 'true',
                bracketText  : '[Draft]',
                disabled     : true,
                emptyText    : '',
                height       : null,
                meta         : {dense: true},
                nullText     : 'null',
                numericText  : '42',
                tags         : ['alpha', 2],
                useRipple    : false,
                width        : 220
            });

            const untrusted = formatConfig.parseConfigParams(
                '#__proto__=polluted&constructor=bad&prototype=bad&store=hack&badJson=[broken&badUri=%E0%A4%A&nested=%7B%22__proto__%22%3A%7B%22polluted%22%3Atrue%7D%7D&text=Clean',
                ConfigurationViewport.internalExampleConfigs
            );

            expect(untrusted).toEqual({text: 'Clean'});
            expect(({}).polluted).toBeUndefined();
        } finally {
            store.destroy();
        }
    });

    test('workbench syncs changed configs to URL via replaceState, restores typed state on load, and clears URL on Reset', () => {
        const origMain   = Neo.Main,
              origHash   = Neo.config.hash,
              routeCalls = [];

        Neo.Main = {
            setRoute(data) {
                routeCalls.push(data);
            }
        };

        let firstViewport;
        let restoredViewport;

        try {
            delete Neo.config.hash;
            firstViewport = Neo.create(ButtonMainContainer, {autoMount: false, windowId: 71});

            expect(routeCalls).toHaveLength(0);
            expect(firstViewport.getUrlHash()).toBe('');

            firstViewport.onRadioChange('badgePosition', 'bottom-left', {value: true});
            firstViewport.onConfigChange('text', {value: '42'});
            firstViewport.onConfigChange('disabled', {value: true});
            firstViewport.onConfigChange('width', {value: 220});
            firstViewport.exampleComponent.ui = 'secondary';

            const syncedHash = routeCalls.at(-1)?.value;
            expect(routeCalls.at(-1)).toEqual({
                replace : true,
                value   : 'badgePosition=bottom-left&disabled=true&text=%2242%22&ui=secondary&width=220',
                windowId: 71
            });

            // Open a fresh workbench instance with that URL hash plus invalid/unknown parameters
            routeCalls.length = 0;
            Neo.config.hash = {
                hashString: `${syncedHash}&unknownKey=ignored&ui=not-in-store&badgePosition=not-an-option&disabled=not-bool&__proto__=bad`,
                windowId  : 72
            };

            restoredViewport = Neo.create(ButtonMainContainer, {autoMount: false, windowId: 72});

            // Note: ui=not-in-store and badgePosition=not-an-option follow valid entries in query string?
            // parseConfigParams keeps last key occurrence, so test invalid keys on distinct controls (iconPosition, height)
            restoredViewport.destroy();

            Neo.config.hash = {
                hashString: `${syncedHash}&unknownKey=ignored&iconPosition=invalid-pos&height=not-a-number&useRippleEffect=not-a-bool&__proto__=bad`,
                windowId  : 73
            };

            restoredViewport = Neo.create(ButtonMainContainer, {autoMount: false, windowId: 73});

            expect(routeCalls).toHaveLength(0);
            expect(restoredViewport.exampleComponent.badgePosition).toBe('bottom-left');
            expect(restoredViewport.exampleComponent.text).toBe('42');
            expect(restoredViewport.exampleComponent.disabled).toBe(true);
            expect(restoredViewport.exampleComponent.width).toBe(220);
            expect(restoredViewport.exampleComponent.ui).toBe('secondary');
            expect(restoredViewport.exampleComponent.iconPosition).toBe('left');
            expect(restoredViewport.exampleComponent.height).toBe(50);
            expect(restoredViewport.exampleComponent.useRippleEffect).toBe(true);

            expect(restoredViewport.down({valueLabel: 'bottom-left'}).checked).toBe(true);
            expect(restoredViewport.down({valueLabel: 'top-right'}).checked).toBe(false);
            expect(restoredViewport.down({labelText: 'text'}).value).toBe('42');
            expect(restoredViewport.down({labelText: 'disabled'}).checked).toBe(true);
            expect(restoredViewport.down({labelText: 'width'}).value).toBe(220);
            expect(restoredViewport.down({labelText: 'ui'}).value?.id).toBe('secondary');
            expect(restoredViewport.getCodeText()).toContain("badgePosition: 'bottom-left'");
            expect(restoredViewport.getCodeText()).toContain("text         : '42'");

            // Reset clears the URL hash cleanly and restores defaults
            restoredViewport.onReset();

            expect(routeCalls.at(-1)).toEqual({
                replace : true,
                value   : '',
                windowId: 73
            });
            expect(restoredViewport.getUrlHash()).toBe('');
            expect(restoredViewport.exampleComponent.badgePosition).toBe('top-right');
            expect(restoredViewport.exampleComponent.text).toBe('Hello World');
            expect(restoredViewport.exampleComponent.disabled).toBe(false);
            expect(restoredViewport.exampleComponent.width).toBe(150);
            expect(restoredViewport.exampleComponent.ui).toBe('primary');

            // Live external HashHistory navigation updates controls and component without echoing setRoute
            routeCalls.length = 0;
            Neo.util.HashHistory.push({
                appName   : restoredViewport.appName,
                hash      : {badgePosition: 'top-left', width: 180},
                hashString: 'badgePosition=top-left&width=180',
                windowId  : 73
            });

            expect(routeCalls).toHaveLength(0);
            expect(restoredViewport.exampleComponent.badgePosition).toBe('top-left');
            expect(restoredViewport.exampleComponent.width).toBe(180);
            expect(restoredViewport.down({valueLabel: 'top-left'}).checked).toBe(true);
            expect(restoredViewport.down({labelText: 'width'}).value).toBe(180);
        } finally {
            delete Neo.util.HashHistory.stacks[73];
            firstViewport?.destroy();
            restoredViewport?.destroy();
            if (origMain !== undefined) Neo.Main = origMain; else delete Neo.Main;
            if (origHash !== undefined) Neo.config.hash = origHash; else delete Neo.config.hash;
        }
    });
});
