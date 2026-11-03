import {test, expect}   from '@playwright/test';
import {guessBaseClass} from '../../../../buildScripts/create/class.mjs';

test.describe('buildScripts/create/class.mjs guessBaseClass()', () => {
    test('returns container.Viewport when className ends with Viewport (case-insensitive)', () => {
        expect(guessBaseClass('MyApp.view.Viewport')).toBe('container.Viewport');
        expect(guessBaseClass('MyApp.view.MainViewport')).toBe('container.Viewport');
        expect(guessBaseClass('Neo.examples.button.base.MainViewport')).toBe('container.Viewport');
    });

    test('preserves existing base class mappings for models, stores, components, controllers, stateProviders, tables, tabs, and containers', () => {
        expect(guessBaseClass('MyApp.model.User')).toBe('data.Model');
        expect(guessBaseClass('MyApp.store.Users')).toBe('data.Store');
        expect(guessBaseClass('MyApp.view.HeaderComponent')).toBe('component.Base');
        expect(guessBaseClass('MyApp.view.MainViewportController')).toBe('controller.Component');
        expect(guessBaseClass('MyApp.view.MainViewportStateProvider')).toBe('state.Provider');
        expect(guessBaseClass('MyApp.view.UserTable')).toBe('table.Container');
        expect(guessBaseClass('MyApp.view.MainTabContainer')).toBe('tab.Container');
        expect(guessBaseClass('MyApp.view.MainContainer')).toBe('container.Base');
    });
});
