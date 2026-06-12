import {setup} from '../../setup.mjs';

const appName = 'ContainerViewportSetupMocksTest';

setup({
    appConfig: {
        name: appName
    },
    mockLocalStorage: false,
    mockMain        : false
});

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../src/Neo.mjs';
import * as core            from '../../../../src/core/_export.mjs';
import ComponentController  from '../../../../src/controller/Component.mjs';
import Viewport             from '../../../../src/container/Viewport.mjs';

/**
 * @summary Test controller for exercising setup-level route and storage mocks.
 *
 * The controller combines default-hash routing with a construction-time LocalStorage
 * read to mirror production-shaped root viewport controllers in downstream apps.
 * @class Test.Unit.Container.ViewportSetupMocksController
 * @extends Neo.controller.Component
 */
class TestController extends ComponentController {
    static config = {
        className  : 'Test.Unit.Container.ViewportSetupMocksController',
        defaultHash: '/home'
    }

    onComponentConstructed() {
        this.storagePromise = Neo.main.addon.LocalStorage.readLocalStorageItem({
            key     : ['viewportSetupTheme', 'viewportSetupLayout'],
            windowId: this.windowId
        });
    }
}
TestController = Neo.setupClass(TestController);

/**
 * @summary Test viewport for the setup runtime-facade smoke path.
 *
 * The viewport disables browser-only body mounting behavior so the unit test can
 * focus on controller construction without requiring a real main-thread DOM.
 * @class Test.Unit.Container.ViewportSetupMocksViewport
 * @extends Neo.container.Viewport
 */
class TestViewport extends Viewport {
    static config = {
        applyBodyCls: false,
        autoMount   : false,
        className   : 'Test.Unit.Container.ViewportSetupMocksViewport',
        controller  : TestController
    }
}
TestViewport = Neo.setupClass(TestViewport);

test.describe('test/playwright/setup.mjs viewport mocks', () => {
    let previousMain, previousLocalStorage, viewport;

    test.beforeEach(() => {
        previousMain         = Neo.Main;
        previousLocalStorage = Neo.main?.addon?.LocalStorage;
        viewport             = null;

        delete Neo.Main;

        if (Neo.main?.addon) {
            delete Neo.main.addon.LocalStorage;
        }
    });

    test.afterEach(() => {
        viewport?.destroy();

        if (previousMain === undefined) {
            delete Neo.Main;
        } else {
            Neo.Main = previousMain;
        }

        if (previousLocalStorage === undefined) {
            delete Neo.main.addon.LocalStorage;
        } else {
            Neo.main.addon.LocalStorage = previousLocalStorage;
        }
    });

    test('setup() provides default Neo.Main and LocalStorage mocks for viewport controller smoke tests', async () => {
        setup({
            appConfig: {
                name: appName
            }
        });

        expect(Neo.Main.setRoute).toBeInstanceOf(Function);
        expect(Neo.main.addon.LocalStorage.readLocalStorageItem).toBeInstanceOf(Function);
        expect(Neo.main.addon.LocalStorage.updateLocalStorageItem).toBeInstanceOf(Function);
        expect(Neo.main.addon.LocalStorage.destroyLocalStorageItem).toBeInstanceOf(Function);

        viewport = Neo.create(TestViewport, {appName});

        await viewport.controller.ready();
        await viewport.controller.storagePromise;

        expect(viewport.controller.isReady).toBe(true);
    });

    test('setup() preserves pre-installed Neo.Main and LocalStorage mocks', async () => {
        const routeCalls = [];
        const storageReads = [];

        Neo.Main = {
            setRoute: data => routeCalls.push(data)
        };

        Neo.main.addon.LocalStorage = {
            destroyLocalStorageItem: async () => {},
            readLocalStorageItem: async data => {
                storageReads.push(data);
                return {key: data.key, value: Object.fromEntries(data.key.map(item => [item, null]))}
            },
            updateLocalStorageItem: async () => {}
        };

        setup({
            appConfig: {
                name: appName
            }
        });

        viewport = Neo.create(TestViewport, {appName});

        await viewport.controller.ready();
        await viewport.controller.storagePromise;

        expect(routeCalls).toEqual([{value: '/home', windowId: null}]);
        expect(storageReads).toEqual([{
            key     : ['viewportSetupTheme', 'viewportSetupLayout'],
            windowId: null
        }]);
    });

    test('setup() can opt out of Neo.Main and LocalStorage mocks', () => {
        setup({
            appConfig: {
                name: appName
            },
            mockLocalStorage: false,
            mockMain        : false
        });

        expect(Neo.Main).toBeUndefined();
        expect(Neo.main.addon.LocalStorage).toBeUndefined();
    });
});
