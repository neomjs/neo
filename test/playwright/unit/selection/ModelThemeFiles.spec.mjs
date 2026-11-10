import {setup} from '../../setup.mjs';

const appName = 'SelectionModelThemeFilesTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
// registers Neo.get: the model resolves its view by id
import Instance  from '../../../../src/manager/Instance.mjs';
import Component from '../../../../src/component/Base.mjs';
import Model     from '../../../../src/selection/Model.mjs';

/**
 * @summary A selection model asks for its own theme files in the window of the view it is registered on,
 * and follows that view to another window (`Neo.selection.Model#afterSetWindowId`).
 */
test.describe('Neo.selection.Model: theme files', () => {
    class ThemedModel extends Model {
        static config = {
            className: 'Test.Unit.Selection.ModelThemeFiles.ThemedModel',
            cls      : 'test-selection-themedmodel'
        }
    }
    Neo.setupClass(ThemedModel);

    let calls, original;

    // the windows this model class asked for, in order
    const windowsAskedFor = () => calls.filter(([, proto]) => proto === ThemedModel.prototype).map(([windowId]) => windowId);

    const createView = windowId => Neo.create(Component, {appName, windowId});

    test.beforeEach(() => {
        calls    = [];
        original = Neo.currentWorker.insertThemeFiles;

        Neo.currentWorker.insertThemeFiles = (...args) => calls.push(args)
    });

    test.afterEach(() => {
        Neo.currentWorker.insertThemeFiles = original
    });

    test('a registered model asks for its theme files in the window of its view', () => {
        const view  = createView('window-a'),
              model = Neo.create(ThemedModel);

        expect(windowsAskedFor(), 'a model without a view asks for nothing').toEqual([]);

        model.register(view);

        expect(model.windowId).toBe('window-a');
        expect(windowsAskedFor()).toEqual(['window-a']);

        model.destroy();
        view.destroy()
    });

    test('a view that moves to another window takes the model\'s theme files along', () => {
        const view  = createView('window-a'),
              model = Neo.create(ThemedModel);

        model.register(view);
        view.windowId = 'window-b';

        expect(model.windowId).toBe('window-b');
        expect(windowsAskedFor()).toEqual(['window-a', 'window-b']);

        model.destroy();
        view.destroy()
    });

    test('a view that gets its window after the model registered is followed as well', () => {
        const view  = createView(null),
              model = Neo.create(ThemedModel);

        model.register(view);

        expect(model.windowId).toBe(null);
        expect(windowsAskedFor()).toEqual([]);

        view.windowId = 'window-a';

        expect(windowsAskedFor()).toEqual(['window-a']);

        model.destroy();
        view.destroy()
    });

    test('an unregistered model no longer follows its former view', () => {
        const view  = createView('window-a'),
              model = Neo.create(ThemedModel);

        model.register(view);
        model.unregister();

        expect(model.windowId).toBe(null);

        view.windowId = 'window-b';

        expect(model.windowId).toBe(null);
        expect(windowsAskedFor()).toEqual(['window-a']);

        model.destroy();
        view.destroy()
    });

    test('a model registered on a second view follows that view only', () => {
        const first  = createView('window-a'),
              second = createView('window-b'),
              model  = Neo.create(ThemedModel);

        model.register(first);
        model.register(second);

        first.windowId = 'window-c';

        expect(model.windowId).toBe('window-b');
        expect(windowsAskedFor()).toEqual(['window-a', 'window-b']);

        model.destroy();
        first.destroy();
        second.destroy()
    })
});
