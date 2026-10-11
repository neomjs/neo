import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ComponentGetThemeTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';

/**
 * @summary A container whose class default names the light theme, so its children inherit it
 * through the class-default rung of item creation.
 */
class LightScope extends Container {
    static config = {
        className: 'Neo.test.component.GetTheme.LightScope',
        theme    : 'neo-theme-neo-light'
    }
}

LightScope = Neo.setupClass(LightScope);

const appName = 'ComponentGetThemeTest';

/**
 * `getTheme()` answers the closest theme. A child of a themed scope inherits the theme as a config
 * and, by design, carries no class of its own; a parent's vdom holds it as a component reference,
 * whose `cls` is empty. So the answer has to come from the theme configs on the component chain,
 * not from a walk over vdom nodes — that walk finds nothing and falls back to the app default,
 * which is what the shared tooltip then stamps on itself inside a nested scope.
 */
test.describe('Neo.component.Base#getTheme — the closest theme through the component chain', () => {
    let root = null;

    test.afterEach(() => {
        root?.destroy();
        root = null
    });

    test('a child of a themed scope answers the scope\'s theme, without a class of its own', () => {
        root = Neo.create(Container, {
            appName,
            theme: 'neo-theme-neo-dark',
            items: [{module: LightScope, items: [{module: Component}]}]
        });

        const scope = root.items[0],
              child = scope.items[0];

        expect(scope.cls, 'the scope carries its class').toContain('neo-theme-neo-light');
        expect(child.cls, 'the child inherits, no local carrier').not.toContain('neo-theme-neo-light');
        expect(child.getTheme(), 'the closest theme is the scope\'s').toBe('neo-theme-neo-light')
    });

    test('a component with its own theme answers its own', () => {
        root = Neo.create(Container, {
            appName,
            theme: 'neo-theme-neo-dark',
            items: [{module: LightScope}]
        });

        expect(root.items[0].getTheme()).toBe('neo-theme-neo-light');
        expect(root.getTheme()).toBe('neo-theme-neo-dark')
    });

    test('a component with no theme anywhere on its chain answers the app default', () => {
        root = Neo.create(Container, {
            appName,
            items: [{module: Component}]
        });

        expect(root.items[0].getTheme()).toBe(Neo.config.themes?.[0])
    })
});
