import {setup} from '../../../../setup.mjs';

const appName = 'DocsMainContainerControllerTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}          from '@playwright/test';
import Neo                     from '../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../src/core/_export.mjs';
import InstanceManager         from '../../../../../../src/manager/Instance.mjs';
import Collection              from '../../../../../../src/collection/Base.mjs';
import Component               from '../../../../../../src/component/Base.mjs';
import Container               from '../../../../../../src/container/Base.mjs';
import Tooltip                 from '../../../../../../src/tooltip/Base.mjs';
import ApiStore                from '../../../../../../docs/app/store/Api.mjs';
import ContentTabContainer     from '../../../../../../docs/app/view/ContentTabContainer.mjs';
import DocsMainContainer       from '../../../../../../docs/app/view/MainContainer.mjs';
import ExamplesStore           from '../../../../../../docs/app/store/Examples.mjs';
import MainContainerController from '../../../../../../docs/app/view/MainContainerController.mjs';
import StateProvider           from '../../../../../../src/state/Provider.mjs';

class MockTreeList extends Component {
    static config = {
        className: 'Test.Unit.Docs.MainContainerController.MockTreeList',
        store    : null
    }
}
MockTreeList = Neo.setupClass(MockTreeList);

test.describe('Docs.view.MainContainerController tab header tooltips', () => {
    test('shares one structure index across complete navigation projections and source routes', async () => {
        Neo.main ??= {};
        Neo.main.addon ??= {};
        const previousHighlight    = Object.getOwnPropertyDescriptor(Neo.main.addon, 'HighlightJS'),
              previousXhr          = Neo.Xhr,
              previousApiLoad      = ApiStore.prototype.load,
              previousExamplesLoad = ExamplesStore.prototype.load,
              previousEnvironment  = Neo.config.environment,
              rows                 = [
                  {id: 40, parentId: null, name: 'apps'},
                  {id: 71, parentId: 40, name: 'docs'},
                  {id: 72, parentId: 71, name: 'Viewport', isLeaf: true, className: 'Docs.app.Viewport', srcPath: 'docs/app/Viewport.mjs'},
                  {id: 10, parentId: null, name: 'src'},
                  {id: 11, parentId: 10, name: 'data'},
                  {id: 12, parentId: 11, name: 'Store', isLeaf: true, className: 'Neo.data.Store', srcPath: 'src/data/Store.mjs'}
              ];
        let view, loads = 0;

        Neo.main.addon.HighlightJS = {
            loadFiles      : () => {}, syntaxHighlightInit: () => {}, syntaxHighlightLine: () => {},
            syntaxHighlight: () => Promise.resolve()
        };
        Neo.Xhr = {promiseJson: () => Promise.resolve(null), promiseRequest: () => Promise.resolve({response: ''})};
        ApiStore.prototype.load = function() {
            loads++;
            this.data = rows.map(row => ({...row}));
            return Promise.resolve(this.items)
        };
        ExamplesStore.prototype.load = () => Promise.resolve([]);

        try {
            for (const environment of ['development', 'production']) {
                Neo.config.environment = environment;
                view = Neo.create(DocsMainContainer, {appName, applyBodyCls: false});
                await view.ready();
                const controller = view.controller, provider = view.getStateProvider(),
                      source     = provider.getStore('structure'), api = provider.getStore('api'), apps = provider.getStore('apps'),
                      apiTree    = controller.getReference('api-treelist'), appTree = controller.getReference('apps-treelist'),
                      tabs       = apiTree.up('tab-container');

                expect(loads).toBe(environment === 'development' ? 1 : 2);
                expect(source.count).toBe(6);
                expect(api.items.map(item => item.id)).toEqual([10, 11, 12]);
                expect(apps.items.map(item => item.id)).toEqual([40, 71, 72]);
                expect(tabs.activeIndex).toBe(0);
                expect(tabs.getTabButtons().map(button => button.text)).toEqual(['API', 'Apps', 'Examples']);
                expect(controller.getReference('examples-tab-button').disabled).toBe(environment !== 'development');

                controller.onNavigationSearchFieldChange({value: 'Store'});
                expect(appTree.getVdomChild(appTree.getItemId(72)).style.display).toBe('none');
                controller.onViewSourceRoute({className: 'Docs.app.Viewport', lineNumber: '7'});
                const sourceView = controller.getReference('content-tabcontainer').getCardContainer().items.at(-1);
                expect(sourceView.structureData).toBe(source.get(72));
                expect(sourceView.line).toBe(7);
                expect(tabs.activeIndex).toBe(0);
                controller.onNavigationSearchFieldChange({value: ''});
                expect(appTree.getVdomChild(appTree.getItemId(72)).style.display).toBe('flex');

                source.data = rows.filter(row => row.id < 40).map(row => ({...row}));
                expect(apps.count).toBe(0);
                expect(api.items.map(item => item.id)).toEqual([10, 11, 12]);
                controller.onNavigationSearchFieldChange({value: '('});

                view.destroy();
                expect([source, api, apps].every(store => store.isDestroyed)).toBe(true);
                view = null
            }
        } finally {
            view?.destroy();
            ApiStore.prototype.load = previousApiLoad;
            ExamplesStore.prototype.load = previousExamplesLoad;
            Neo.Xhr = previousXhr;
            Neo.config.environment = previousEnvironment;
            previousHighlight ? Object.defineProperty(Neo.main.addon, 'HighlightJS', previousHighlight) :
                delete Neo.main.addon.HighlightJS
        }
    });

    test('sets full className and dot-joined example path tooltips on tab header buttons when opening API, Example, and Source tabs', async () => {
        Neo.main ??= {};
        Neo.main.addon ??= {};
        Neo.Main ??= {};

        const
            hasHighlightJS      = Object.prototype.hasOwnProperty.call(Neo.main.addon, 'HighlightJS'),
            hasSetRoute         = Object.prototype.hasOwnProperty.call(Neo.Main, 'setRoute'),
            hasXhr              = Object.prototype.hasOwnProperty.call(Neo, 'Xhr'),
            previousHighlightJS = Neo.main.addon.HighlightJS,
            previousSetRoute    = Neo.Main.setRoute,
            previousXhr         = Neo.Xhr,
            routes              = [];

        Neo.Main.setRoute = data => routes.push(data);

        Neo.main.addon.HighlightJS = {
            loadFiles          : () => {},
            syntaxHighlight    : () => Promise.resolve(),
            syntaxHighlightInit: () => {},
            syntaxHighlightLine: () => {}
        };

        Neo.Xhr = {
            promiseJson   : () => Promise.resolve(null),
            promiseRequest: () => Promise.resolve({response: ''})
        };

        let apiStore, examplesStore, rootContainer;

        try {
            // Stands in for the loaded structure index the class and source routes resolve against
            apiStore = Neo.create(Collection, {
                isLoaded   : true,
                keyProperty: 'id',
                items      : [
                    {
                        id          : 'api-button-base',
                        $kind       : 'class',
                        kind        : 'class',
                        name        : 'Base',
                        className   : 'Neo.button.Base',
                        neoClassName: 'Neo.button.Base',
                        meta        : {filename: 'Base.mjs', lineno: 1, path: '/neo/src/button'},
                        singleton   : false
                    },
                    {
                        id          : 'api-component-base',
                        $kind       : 'class',
                        kind        : 'class',
                        name        : 'Base',
                        className   : 'Neo.component.Base',
                        neoClassName: 'Neo.component.Base',
                        meta        : {filename: 'Base.mjs', lineno: 1, path: '/neo/src/component'},
                        singleton   : false
                    }
                ]
            });

            examplesStore = Neo.create(Collection, {
                keyProperty: 'id',
                items      : [
                    {
                        id      : 1,
                        parentId: null,
                        name    : 'Configuration'
                    },
                    {
                        id      : 2,
                        parentId: 1,
                        name    : 'button'
                    },
                    {
                        id      : 3,
                        parentId: 2,
                        name    : 'Base',
                        path    : '../../../src/container/Base.mjs'
                    },
                    {
                        id      : 4,
                        parentId: 2,
                        name    : 'Multi',
                        path    : ['../../../src/container/Base.mjs']
                    }
                ]
            });

            rootContainer = Neo.create(Container, {
                appName,
                controller   : MainContainerController,
                ntype        : 'main-container',
                store        : apiStore,
                stateProvider: {module: StateProvider, stores: {structure: apiStore}},
                items        : [
                    {
                        module   : MockTreeList,
                        reference: 'api-treelist',
                        store    : apiStore
                    },
                    {
                        module   : MockTreeList,
                        reference: 'examples-treelist',
                        store    : examplesStore
                    },
                    {
                        module   : ContentTabContainer,
                        reference: 'content-tabcontainer',
                        sortable : false
                    }
                ]
            });

            const
                controller          = rootContainer.controller,
                contentTabContainer = controller.getReference('content-tabcontainer'),
                tabBar              = contentTabContainer.getTabBar(),
                buttonApiRecord     = apiStore.get('api-button-base'),
                componentApiRecord  = apiStore.get('api-component-base'),
                exampleLeafRecord   = examplesStore.get(3),
                multiExampleRecord  = examplesStore.get(4);

            // 1. An API leaf click navigates to its class route, and the route opens the tab. Two API tabs with the same
            // leaf name ('Base') get distinct full className tooltips, and each header carries its route
            controller.onApiListLeafClick(buttonApiRecord);
            expect(routes).toEqual([{value: '/viewClass/Neo.button.Base', windowId: controller.windowId}]);

            controller.onViewClassRoute({className: buttonApiRecord.className});
            controller.onViewClassRoute({className: componentApiRecord.className});

            const
                buttonApiTabButton    = tabBar.items[1],
                componentApiTabButton = tabBar.items[2];

            expect(buttonApiTabButton.text).toBe('Base');
            expect(buttonApiTabButton.route).toBe('/viewClass/Neo.button.Base');
            expect(buttonApiTabButton._tooltip).toEqual({text: 'Neo.button.Base'});
            expect(buttonApiTabButton.cls).toContain('neo-uses-shared-tooltip');

            expect(componentApiTabButton.text).toBe('Base');
            expect(componentApiTabButton._tooltip).toEqual({text: 'Neo.component.Base'});
            expect(componentApiTabButton.cls).toContain('neo-uses-shared-tooltip');

            // 2. Opening single-path and array-path Examples leaves assigns the dot-joined ancestry path as the tab header tooltip
            controller.onExamplesListLeafClick(exampleLeafRecord);
            controller.onExamplesListLeafClick(multiExampleRecord);

            await expect.poll(() => tabBar.items.length).toBe(5);

            const
                exampleTabButton      = tabBar.items[3],
                multiExampleTabButton = tabBar.items[4];

            expect(exampleTabButton.text).toBe('Base');
            expect(exampleTabButton._tooltip).toEqual({text: 'Configuration.button.Base'});
            expect(exampleTabButton.cls).toContain('neo-uses-shared-tooltip');

            expect(multiExampleTabButton.text).toBe('Multi');
            expect(multiExampleTabButton._tooltip).toEqual({text: 'Configuration.button.Multi'});
            expect(multiExampleTabButton.cls).toContain('neo-uses-shared-tooltip');

            // 3. Navigating to /viewSource assigns the full className as the source tab header tooltip
            controller.onViewSourceRoute({
                className : 'Neo.button.Base',
                lineNumber: '25'
            });

            const sourceTabButton = tabBar.items[5];

            expect(sourceTabButton.text).toBe('Base');
            expect(sourceTabButton.route).toBe('/viewSource/Neo.button.Base');
            expect(sourceTabButton._tooltip).toEqual({text: 'Neo.button.Base'});
            expect(sourceTabButton.cls).toContain('neo-uses-shared-tooltip');
        } finally {
            rootContainer?.destroy();
            apiStore?.destroy();
            examplesStore?.destroy();

            if (hasHighlightJS) {
                Neo.main.addon.HighlightJS = previousHighlightJS;
            } else {
                delete Neo.main.addon.HighlightJS;
            }

            if (hasSetRoute) {
                Neo.Main.setRoute = previousSetRoute;
            } else {
                delete Neo.Main.setRoute;
            }

            if (hasXhr) {
                Neo.Xhr = previousXhr;
            } else {
                delete Neo.Xhr;
            }
        }
    });

    test('adjusts theme and source-view theme button texts to oppose the initial theme, publishes body theme only when standalone, and hides the Docs theme button inside the Portal', async () => {
        Neo.main ??= {};
        Neo.main.addon ??= {};
        Neo.main.DomAccess ??= {};

        const
            hasApplyBodyCls      = Object.prototype.hasOwnProperty.call(Neo.main.DomAccess, 'applyBodyCls'),
            hasHighlightJS       = Object.prototype.hasOwnProperty.call(Neo.main.addon, 'HighlightJS'),
            hasSetBodyCls        = Object.prototype.hasOwnProperty.call(Neo.main.DomAccess, 'setBodyCls'),
            hasStylesheet        = Object.prototype.hasOwnProperty.call(Neo.main.addon, 'Stylesheet'),
            hasXhr               = Object.prototype.hasOwnProperty.call(Neo, 'Xhr'),
            previousApiLoad      = ApiStore.prototype.load,
            previousApplyBody    = Neo.main.DomAccess.applyBodyCls,
            previousExamplesLoad = ExamplesStore.prototype.load,
            previousHighlightJS  = Neo.main.addon.HighlightJS,
            previousSetBody      = Neo.main.DomAccess.setBodyCls,
            previousStylesheet   = Neo.main.addon.Stylesheet,
            previousThemes       = Neo.config.themes,
            previousXhr          = Neo.Xhr,
            applyBodyCalls       = [],
            bodyCalls            = [],
            loadFilesCalls       = [],
            swapCalls            = [];

        ApiStore.prototype.load      = () => Promise.resolve();
        ExamplesStore.prototype.load = () => Promise.resolve();

        Neo.main.DomAccess.applyBodyCls = opts => {
            applyBodyCalls.push(opts);
            return Promise.resolve()
        };

        Neo.main.DomAccess.setBodyCls = opts => {
            bodyCalls.push(opts);
            return Promise.resolve()
        };

        Neo.main.addon.HighlightJS = {
            loadFiles          : opts => {loadFilesCalls.push(opts)},
            syntaxHighlightInit: () => {}
        };

        Neo.main.addon.Stylesheet = {
            swapStyleSheet: opts => {
                swapCalls.push(opts);
                return Promise.resolve()
            }
        };

        Neo.Xhr = {
            promiseJson: () => Promise.resolve(null)
        };

        let portalHost, standaloneView;

        try {
            // 1. Standalone DocsMainContainer (top-level Viewport): dark boot offers 'Theme Light' & 'Source View Theme Light',
            //    and first click toggles view.theme / view.cls via afterSetTheme and publishes to document.body.
            Neo.config.themes = ['neo-theme-dark', 'neo-theme-light'];

            standaloneView = Neo.create(DocsMainContainer, {
                appName
            });

            const
                standaloneController       = standaloneView.controller,
                standaloneThemeButton      = standaloneController.getReference('theme-button'),
                standaloneSourceViewButton = standaloneController.getReference('source-view-theme-button');

            expect(standaloneThemeButton.hidden).toBe(false);
            expect(standaloneThemeButton.text).toBe('Theme Light');
            expect(standaloneSourceViewButton.text).toBe('Source View Theme Light');
            expect(bodyCalls).toHaveLength(0);
            expect(loadFilesCalls.at(-1)).toEqual({
                themePath: Neo.config.basePath + 'resources/lib/highlightjs-custom-dark-theme.css',
                windowId : null
            });

            standaloneController.onSwitchThemeButtonClick();

            expect(standaloneView.theme).toBe('neo-theme-light');
            expect(standaloneView.cls).toContain('neo-theme-light');
            expect(standaloneView.cls).not.toContain('neo-theme-dark');
            expect(standaloneThemeButton.text).toBe('Theme Dark');
            expect(bodyCalls).toHaveLength(1);
            expect(bodyCalls[0]).toEqual({
                add     : ['neo-theme-light'],
                remove  : ['neo-theme-dark'],
                windowId: null
            });

            standaloneController.onSwitchThemeButtonClick();

            expect(standaloneView.theme).toBe('neo-theme-dark');
            expect(standaloneView.cls).toContain('neo-theme-dark');
            expect(standaloneView.cls).not.toContain('neo-theme-light');
            expect(standaloneThemeButton.text).toBe('Theme Light');
            expect(bodyCalls).toHaveLength(2);
            expect(bodyCalls[1]).toEqual({
                add     : ['neo-theme-dark'],
                remove  : ['neo-theme-light'],
                windowId: null
            });

            // 2. Embedded DocsMainContainer inside a Portal host: inherits Portal theme without publishing to document.body,
            //    hides the Docs theme button (Portal header owns the page theme), and syncs/toggles the source-view theme button.
            bodyCalls.length = 0;
            Neo.config.themes = ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-light', 'neo-theme-dark'];

            portalHost = Neo.create(Container, {
                appName: 'Portal',
                items  : [{module: DocsMainContainer}]
            });

            const
                embeddedDocs             = portalHost.items[0],
                embeddedController       = embeddedDocs.controller,
                embeddedThemeButton      = embeddedController.getReference('theme-button'),
                embeddedSourceViewButton = embeddedController.getReference('source-view-theme-button');

            expect(embeddedDocs.theme).toBeNull();
            expect(embeddedDocs.getTheme()).toBe('neo-theme-neo-dark');
            expect(bodyCalls).toHaveLength(0);
            expect(embeddedThemeButton.hidden).toBe(true);
            expect(embeddedSourceViewButton.text).toBe('Source View Theme Light');
            expect(loadFilesCalls.at(-1)).toEqual({
                themePath: Neo.config.basePath + 'resources/lib/highlightjs-custom-dark-theme.css',
                windowId : null
            });

            // Source-view theme button toggles HighlightJS stylesheet without publishing to document.body
            embeddedController.onSwitchSourceViewThemeButtonClick();
            await Promise.resolve();

            expect(swapCalls.at(-1)).toEqual({
                href    : Neo.config.basePath + 'resources/lib/highlightjs-custom-github-theme.css',
                id      : 'hljs-theme',
                windowId: null
            });
            expect(embeddedSourceViewButton.text).toBe('Source View Theme Dark');
            expect(bodyCalls).toHaveLength(0);

            // Host theme switch propagates to the embedded Docs view while its own theme button stays hidden
            portalHost.theme = 'neo-theme-neo-light';
            expect(embeddedDocs.getTheme()).toBe('neo-theme-neo-light');
            expect(embeddedThemeButton.hidden).toBe(true);
        } finally {
            standaloneView?.destroy();
            portalHost?.destroy();
            ApiStore.prototype.load      = previousApiLoad;
            ExamplesStore.prototype.load = previousExamplesLoad;
            Neo.config.themes            = previousThemes;

            if (hasApplyBodyCls) {
                Neo.main.DomAccess.applyBodyCls = previousApplyBody;
            } else {
                delete Neo.main.DomAccess.applyBodyCls;
            }

            if (hasSetBodyCls) {
                Neo.main.DomAccess.setBodyCls = previousSetBody;
            } else {
                delete Neo.main.DomAccess.setBodyCls;
            }

            if (hasHighlightJS) {
                Neo.main.addon.HighlightJS = previousHighlightJS;
            } else {
                delete Neo.main.addon.HighlightJS;
            }

            if (hasStylesheet) {
                Neo.main.addon.Stylesheet = previousStylesheet;
            } else {
                delete Neo.main.addon.Stylesheet;
            }

            if (hasXhr) {
                Neo.Xhr = previousXhr;
            } else {
                delete Neo.Xhr;
            }
        }
    });
});
