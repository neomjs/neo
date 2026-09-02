import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ContainerItemThemeTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';

/**
 * @summary A component whose class default names a theme, for the class-default rung of the precedence.
 */
class LightByDefault extends Component {
    static config = {
        className: 'Neo.test.container.ItemTheme.LightByDefault',
        theme    : 'neo-theme-neo-light'
    }
}

LightByDefault = Neo.setupClass(LightByDefault);

const appName = 'ContainerItemThemeTest';

/**
 * The precedence an item's theme resolves through at creation, from the object branch of
 * `container.Base#createItem`: the item config's own theme, then `itemDefaults`, then the item
 * class's default, then the parent's theme — the same order every other item config key has. A
 * nested theme is the documented feature ("a dark-themed grid inside a light-themed panel"), and
 * the shared tooltip reads it to decide which theme class to stamp on itself.
 */
test.describe('Neo.container.Base — an item config\'s own theme survives creation', () => {
    let container = null;

    test.afterEach(() => {
        container?.destroy();
        container = null
    });

    test('an item config carrying its own theme keeps it under a differently themed parent', () => {
        container = Neo.create(Container, {
            appName,
            theme: 'neo-theme-neo-dark',
            items: [{module: Component, theme: 'neo-theme-neo-light'}]
        });

        const [item] = container.items;

        expect(item.theme, 'the explicit item theme').toBe('neo-theme-neo-light');
        expect(item.cls, 'and it carries the class, since it differs from the physical parent\'s').toContain('neo-theme-neo-light')
    });

    test('an item without a theme inherits the parent\'s and carries no class of its own', () => {
        container = Neo.create(Container, {
            appName,
            theme: 'neo-theme-neo-dark',
            items: [{module: Component}]
        });

        const [item] = container.items;

        expect(item.theme).toBe('neo-theme-neo-dark');
        expect(item.cls, 'inherited from the physical parent: no local carrier').not.toContain('neo-theme-neo-dark')
    });

    test('itemDefaults outrank the class default, and the class default outranks the parent', () => {
        container = Neo.create(Container, {
            appName,
            theme       : 'neo-theme-neo-dark',
            itemDefaults: {theme: 'neo-theme-light'},
            items       : [{module: Component}, {module: LightByDefault}]
        });

        expect(container.items[0].theme, 'itemDefaults over the parent').toBe('neo-theme-light');
        expect(container.items[1].theme, 'itemDefaults over the class default').toBe('neo-theme-light');

        container.destroy();
        container = Neo.create(Container, {
            appName,
            theme: 'neo-theme-neo-dark',
            items: [{module: LightByDefault}]
        });

        expect(container.items[0].theme, 'the class default over the parent').toBe('neo-theme-neo-light')
    });

    test('an item config theme outranks itemDefaults, like every other item config key', () => {
        container = Neo.create(Container, {
            appName,
            itemDefaults: {theme: 'neo-theme-light'},
            items       : [{module: Component, theme: 'neo-theme-neo-light'}]
        });

        expect(container.items[0].theme).toBe('neo-theme-neo-light')
    })
});
