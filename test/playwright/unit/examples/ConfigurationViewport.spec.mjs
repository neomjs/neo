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
import TabMainContainer        from '../../../../examples/tab/container/MainContainer.mjs';
import TabOverflow             from '../../../../src/tab/plugin/Overflow.mjs';
import Store                   from '../../../../src/data/Store.mjs';
import * as formatConfig       from '../../../../examples/workbench/formatConfig.mjs';

const {cloneConfig, formatExampleCode} = formatConfig;

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

    test('code view renders the authored config at initial state and evaluates as valid Neo config', async () => {
        const viewport = Neo.create(ButtonMainContainer, {autoMount: false});

        try {
            const
                code     = viewport.getCodeText(),
                codeView = viewport.down({reference: 'code-output'});

            expect(codeView.vdom.cn[0].cn[0].text).toBe(code);
            expect(codeView.vdom.cn[1].value).toBe(code);
            expect(codeView.vdom.cn[1].text).toBe(code);

            // The menu stays with its items: only the handlers inside it become comments
            expect(code).toContain('// handler: a function, not shown');
            expect(code).not.toContain('console.log');

            const parsed = new Function('Neo', 'return ' + code)(Neo);

            expect(parsed).toMatchObject({
                badgeText: 'Badge',
                flex     : 'none',
                height   : 50,
                iconCls  : 'fa fa-home',
                module   : Neo.button.Base,
                text     : 'Hello World',
                ui       : 'primary',
                width    : 150
            });
            expect(parsed.handler).toBeUndefined();
            expect(parsed.wrapperStyle).toBeUndefined();
            expect(parsed.menu.map(item => item.text)).toEqual(['Item 1', 'Item 2', 'Item 3']);
            expect(parsed.menu[1].cls).toEqual(['neo-red']);
            expect(parsed.menu[2].items.map(item => item.text)).toEqual(['Item 4', 'Item 5', 'Item 6']);

            const created = Neo.create(parsed);
            expect(created.className).toBe('Neo.button.Base');
            expect(created.text).toBe('Hello World');
            created.destroy();
        } finally {
            viewport.destroy();
        }
    });

    test('tab/container: the code view shows the authored tabs, not the live toolbar, strip and body', async () => {
        const viewport = Neo.create(TabMainContainer, {autoMount: false});

        try {
            const
                code   = viewport.getCodeText(),
                parsed = new Function('Neo', 'return ' + code)(Neo);

            expect(parsed.module).toBe(Neo.tab.Container);
            expect(parsed.items.map(item => item.header.text)).toEqual(['Home', 'Media', 'Account']);
            expect(parsed.items[2].header.badgeText).toBe('3');
            expect(parsed.items[0].html).toContain('dragResortable');
            expect(parsed.itemDefaults.cls).toEqual(['neo-examples-tab-component']);
            expect(parsed.headerActions.map(action => action.action)).toEqual(['next-tab', 'previous-tab']);
            expect(parsed.headerToolbar.plugins[0].module).toBe(TabOverflow);

            // The listeners keep their keys as comments: the handlers and the scope are the example's own code
            expect(code).toContain('// activeIndexChange: a function, not shown');
            expect(code).toContain('// scope: a Neo.examples.tab.container.MainContainer instance, not shown');

            // The live container rebuilt its items into its own parts, and none of them reaches the code
            viewport.exampleComponent.items.forEach(item => expect(code).not.toContain(item.id));
        } finally {
            viewport.destroy();
        }
    });

    test('list/base and form/field/text: every literal config the example wrote comes back from the code view', async () => {
        const {describeNonLiteralReason} = formatConfig;

        for (const MainContainer of [ListMainContainer, FieldMainContainer]) {
            const viewport = Neo.create(MainContainer, {autoMount: false});

            try {
                const
                    {authoredConfig} = viewport,
                    parsed           = new Function('Neo', 'return ' + viewport.getCodeText())(Neo);

                expect(parsed.module).toBe(viewport.exampleComponent.constructor);

                Object.entries(authoredConfig).forEach(([key, value]) => {
                    if (!['className', 'module', 'ntype'].includes(key) && !describeNonLiteralReason(value)) {
                        expect(parsed[key], key).toEqual(value)
                    }
                })
            } finally {
                viewport.destroy()
            }
        }
    });

    test('the viewport keeps the authored config as written although creation consumes it', async () => {
        const viewport = Neo.create(TabMainContainer, {autoMount: false});

        try {
            const
                {authoredConfig} = viewport,
                config           = {module: Neo.tab.Container, headerToolbar: {}, items: []},
                created          = Neo.create(config);

            // The hazard the copy guards against: headerToolbar is not reactive, so setFields() removes it from
            // the very object Neo.create() receives
            expect(config.headerToolbar).toBeUndefined();
            created.destroy();

            expect(authoredConfig.headerToolbar.plugins[0].module).toBe(TabOverflow);
            expect(authoredConfig.items).toHaveLength(3);
            expect(authoredConfig.module).toBe(Neo.tab.Container);
            expect(authoredConfig.listeners.scope).toBe(viewport);
        } finally {
            viewport.destroy();
        }
    });

    test('cloneConfig copies plain objects and arrays and keeps classes, functions and instances', () => {
        const
            handler = () => {},
            store   = Neo.create(Store, {autoLoad: false});

        try {
            const
                config = {handler, menu: [{text: 'A'}], module: Neo.button.Base, store, style: {margin: 0}},
                clone  = cloneConfig(config);

            expect(clone).toEqual(config);
            expect(clone).not.toBe(config);
            expect(clone.menu).not.toBe(config.menu);
            expect(clone.menu[0]).not.toBe(config.menu[0]);
            expect(clone.style).not.toBe(config.style);
            expect(clone.module).toBe(Neo.button.Base);
            expect(clone.handler).toBe(handler);
            expect(clone.store).toBe(store);
        } finally {
            store.destroy();
        }
    });

    test('code view updates live across inspector handlers, reactive observeConfig, and returns to the authored config on reset', async () => {
        const viewport = Neo.create(ButtonMainContainer, {autoMount: false});

        try {
            const initialCode = viewport.getCodeText();

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

            const parsed = new Function('Neo', 'return ' + code)(Neo);

            // A changed config replaces the authored value; nothing the example did not write appears
            expect(parsed).toMatchObject({
                badgePosition       : 'bottom-left',
                module              : Neo.button.Base,
                rippleEffectDuration: 500,
                text                : "It's live",
                ui                  : 'secondary',
                width               : 220
            });
            expect(parsed.cls).toBeUndefined();
            expect(parsed.wrapperStyle).toBeUndefined();

            // Reverting one config leaves the authored value
            viewport.onConfigChange('width', {value: viewport.initialConfigValues.width});
            expect(viewport.getCodeText()).toContain('width               : 150');
            expect(viewport.getCodeText()).toContain('badgePosition');

            // Reset restores the authored config
            viewport.onReset();
            expect(viewport.getCodeText()).toBe(initialCode);
            expect(viewport.down({reference: 'code-output'}).vdom.cn[0].cn[0].text).toBe(initialCode);
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

    test('formatExampleCode comments out functions and Neo instances where they sit and keeps code evaluable', () => {
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
            expect(code).toContain('        // onClick: a function, not shown');
            expect(code).not.toContain('() => {}');
            expect(code).not.toContain('store   : Neo.data.Store');

            const parsed = new Function('Neo', 'return ' + code)(Neo);
            expect(parsed).toEqual({
                height: 420,
                module: Neo.grid.Container,
                nested: {}
            });

            // An array keeps its writable items around a function
            const list = formatExampleCode('Neo.list.Base', {items: [{text: 'A'}, () => {}, 'B']});
            expect(list).toContain('        // a function, not shown');
            expect(new Function('Neo', 'return ' + list)(Neo).items).toEqual([{text: 'A'}, 'B']);

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

            // Rapid consecutive writes ignore late echoes of earlier writes without reverting newer typing
            restoredViewport.onReset();
            routeCalls.length = 0;

            const textField = restoredViewport.down({labelText: 'text'});
            textField.value = 'B';
            textField.value = 'Bo';

            expect(routeCalls.map(c => c.value)).toEqual(['text=B', 'text=Bo']);

            // Late echo of the first keystroke ('text=B') arrives after 'text=Bo' was already committed
            Neo.util.HashHistory.push({
                appName   : restoredViewport.appName,
                hash      : {text: 'B'},
                hashString: 'text=B',
                windowId  : 73
            });

            expect(restoredViewport.exampleComponent.text).toBe('Bo');
            expect(textField.value).toBe('Bo');

            // Echo of the second keystroke ('text=Bo') drains the pending write queue cleanly
            Neo.util.HashHistory.push({
                appName   : restoredViewport.appName,
                hash      : {text: 'Bo'},
                hashString: 'text=Bo',
                windowId  : 73
            });

            expect(restoredViewport.exampleComponent.text).toBe('Bo');

            // A subsequent genuine Back-button navigation to 'text=B' now restores 'B'
            Neo.util.HashHistory.push({
                appName   : restoredViewport.appName,
                hash      : {text: 'B'},
                hashString: 'text=B',
                windowId  : 73
            });

            expect(restoredViewport.exampleComponent.text).toBe('B');
            expect(textField.value).toBe('B');
        } finally {
            delete Neo.util.HashHistory.stacks[73];
            firstViewport?.destroy();
            restoredViewport?.destroy();
            if (origMain !== undefined) Neo.Main = origMain; else delete Neo.Main;
            if (origHash !== undefined) Neo.config.hash = origHash; else delete Neo.config.hash;
        }
    });

    test('all 37 converted workbench examples return plain config objects from createExampleComponent (#22068)', async () => {
        const convertedPaths = [
            '../../../../examples/button/effect/MainContainer.mjs',
            '../../../../examples/button/split/MainContainer.mjs',
            '../../../../examples/component/canvas/MainContainer.mjs',
            '../../../../examples/component/carousel/MainContainer.mjs',
            '../../../../examples/component/chip/MainContainer.mjs',
            '../../../../examples/component/circle/MainContainer.mjs',
            '../../../../examples/component/clock/MainContainer.mjs',
            '../../../../examples/component/dateSelector/MainContainer.mjs',
            '../../../../examples/component/mwc/button/MainContainer.mjs',
            '../../../../examples/component/mwc/textField/MainContainer.mjs',
            '../../../../examples/component/process/MainContainer.mjs',
            '../../../../examples/component/process/realWorldExample/MainContainer.mjs',
            '../../../../examples/component/progress/MainContainer.mjs',
            '../../../../examples/component/statusbadge/MainContainer.mjs',
            '../../../../examples/component/timer/MainContainer.mjs',
            '../../../../examples/component/video/MainContainer.mjs',
            '../../../../examples/component/wrapper/monacoEditor/MainContainer.mjs',
            '../../../../examples/container/accordion/MainContainer.mjs',
            '../../../../examples/container/fragment/MainContainer.mjs',
            '../../../../examples/date/selectorContainer/MainContainer.mjs',
            '../../../../examples/form/field/picker/MainContainer.mjs',
            '../../../../examples/form/fieldset/MainContainer.mjs',
            '../../../../examples/functional/button/base/MainContainer.mjs',
            '../../../../examples/layout/card/MainContainer.mjs',
            '../../../../examples/layout/cube/MainContainer.mjs',
            '../../../../examples/layout/form/MainContainer.mjs',
            '../../../../examples/list/buffered/MainContainer.mjs',
            '../../../../examples/list/chip/MainContainer.mjs',
            '../../../../examples/list/circle/MainContainer.mjs',
            '../../../../examples/list/color/MainContainer.mjs',
            '../../../../examples/menu/list/MainContainer.mjs',
            '../../../../examples/menu/panel/MainContainer.mjs',
            '../../../../examples/menu/tree/MainContainer.mjs',
            '../../../../examples/sitemap/MainContainer.mjs',
            '../../../../examples/table/container/MainContainer.mjs',
            '../../../../examples/tree/MainContainer.mjs',
            '../../../../examples/treeAccordion/MainContainer.mjs'
        ];

        expect(convertedPaths).toHaveLength(37);

        for (const modulePath of convertedPaths) {
            const {default: ExampleViewport} = await import(modulePath),
                  config                     = ExampleViewport.prototype.createExampleComponent.call(ExampleViewport.prototype);

            expect(Neo.typeOf(config), `${modulePath} returns a plain Object`).toBe('Object');
            expect(config instanceof Neo.core.Base, `${modulePath} does not return a Neo instance`).toBe(false);
            expect(typeof config.module, `${modulePath} carries a module constructor`).toBe('function')
        }
    });

    test('list/circle and process/realWorldExample wire post-construction hooks in onConstructed (#22068)', async () => {
        const [{default: CircleListMainContainer}, {default: RealWorldMainContainer}] = await Promise.all([
            import('../../../../examples/list/circle/MainContainer.mjs'),
            import('../../../../examples/component/process/realWorldExample/MainContainer.mjs')
        ]);

        const origFetch     = globalThis.fetch,
              origRegTarget = Neo.main.DomEvents.registerPreventDefaultTargets,
              origXhr       = Neo.Xhr;

        globalThis.fetch = async url => ({
            json: async () => String(url).includes('open-meteo')
                ? {current_weather: {temperature: 17.2}}
                : []
        });
        Neo.main.DomEvents.registerPreventDefaultTargets ??= () => {};
        Neo.Xhr ??= {promiseJson: async () => ({json: []})};

        let circleViewport, realWorldViewport;

        try {
            circleViewport = Neo.create(CircleListMainContainer, {autoMount: false});
            await circleViewport.initVnode();
            circleViewport.mounted = true;

            expect(circleViewport.exampleComponent.className).toBe('Neo.list.Circle');
            expect(circleViewport.down({name: 'group1'}).value).toBe('Blue');

            circleViewport.changeSorting('DESC', {value: true});
            await new Promise(resolve => setTimeout(resolve, 30));

            expect(circleViewport.down({name: 'group1'}).value).toBe('Yellow');
            expect(circleViewport.down({name: 'group2'}).value).toBe('Red');

            realWorldViewport = Neo.create(RealWorldMainContainer, {autoMount: false});
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(realWorldViewport.down({flag: 'temperature'}).value).toBe(18);
        } finally {
            globalThis.fetch = origFetch;
            if (origRegTarget !== undefined) {
                Neo.main.DomEvents.registerPreventDefaultTargets = origRegTarget;
            } else {
                delete Neo.main.DomEvents.registerPreventDefaultTargets;
            }
            if (origXhr !== undefined) {
                Neo.Xhr = origXhr;
            } else {
                delete Neo.Xhr;
            }
            circleViewport?.destroy();
            realWorldViewport?.destroy();
        }
    });
});
