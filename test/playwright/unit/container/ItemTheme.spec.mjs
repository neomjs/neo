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

import '../../../../src/manager/Instance.mjs';

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
    });

    /**
     * A stored-preference read is a promise, so a theme can land AFTER the tree is
     * built — and an item added later still has to resolve the CURRENT theme rather than the one
     * present at construction. Both directions are asserted because they fail independently:
     * `afterSetTheme` propagates to LIVE items, while `createItem` resolves precedence for a new one.
     * An arm covering only the second passes while a live item keeps a stale theme, and vice versa.
     */
    test('a theme change reaches the live item AND the one added after it', () => {
        container = Neo.create(Container, {
            appName,
            theme: 'neo-theme-neo-dark',
            items: [{module: Component}]
        });

        const [existing] = container.items;

        expect(existing.theme, 'inherited at construction').toBe('neo-theme-neo-dark');

        container.theme = 'neo-theme-neo-light';
        container.add({module: Component});

        expect(existing.theme, 'the live item follows the change').toBe('neo-theme-neo-light');
        expect(container.items[1].theme, 'and the item added after it resolves the CURRENT theme')
            .toBe('neo-theme-neo-light')
    })
});

/**
 * An instance built on its own and handed to `add()` takes `createItem`'s instance branch, not the object
 * branch, so the parent rung has to exist there too: an adopted instance without a theme of its own takes
 * the container's, the way a config item without one does.
 */
test.describe('Neo.container.Base — an adopted instance takes the container\'s theme when it carries none', () => {
    let container = null;

    test.afterEach(() => {
        container?.destroy();
        container = null
    });

    test('an instance without a theme inherits it on add, and so does the subtree it built before', () => {
        container = Neo.create(Container, {appName, theme: 'neo-theme-neo-dark'});

        const adopted = Neo.create(Container, {appName, items: [{module: Component}]});

        container.add(adopted);

        expect(adopted.theme, 'the adopted instance').toBe('neo-theme-neo-dark');
        expect(adopted.cls, 'inherited from the physical parent: no local carrier').not.toContain('neo-theme-neo-dark');
        expect(adopted.items[0].theme, 'the item it created before it was adopted').toBe('neo-theme-neo-dark');

        container.theme = 'neo-theme-neo-light';

        expect(adopted.theme, 'a later change still reaches it').toBe('neo-theme-neo-light');
        expect(adopted.items[0].theme).toBe('neo-theme-neo-light')
    });

    /**
     * @summary Adoption must agree with config construction about a child that carries its own theme.
     *
     * Built from configs, an explicitly themed child survives a differently themed ancestor, because
     * `createItem` resolves each item's own theme first. Adopting the same subtree hands the root a
     * theme, and the live cascade must not treat that as permission to overwrite what the child chose.
     */
    test('an adopted subtree keeps a child\'s own theme, exactly as config construction does', () => {
        container = Neo.create(Container, {
            appName,
            theme: 'neo-theme-neo-dark',
            items: [{
                module: Container,
                items : [{module: Component, theme: 'neo-theme-neo-light'}, {module: Component}]
            }]
        });

        const [builtLight, builtPlain] = container.items[0].items;

        expect(builtLight.theme, 'config construction: the explicit child theme').toBe('neo-theme-neo-light');
        expect(builtPlain.theme, 'config construction: its unthemed sibling').toBe('neo-theme-neo-dark');

        const adopted = Neo.create(Container, {
            appName,
            items: [{module: Component, theme: 'neo-theme-neo-light'}, {module: Component}]
        });

        container.add(adopted);

        const [adoptedLight, adoptedPlain] = adopted.items;

        expect(adopted.theme, 'the adopted root inherits').toBe('neo-theme-neo-dark');
        expect(adoptedLight.theme, 'adoption: the explicit child theme survives too').toBe('neo-theme-neo-light');
        expect(adoptedPlain.theme, 'adoption: its unthemed sibling inherits').toBe('neo-theme-neo-dark')
    });

    test('an adopted instance carrying its own theme keeps it', () => {
        container = Neo.create(Container, {appName, theme: 'neo-theme-neo-dark'});

        const adopted = Neo.create(Component, {appName, theme: 'neo-theme-neo-light'});

        container.add(adopted);

        expect(adopted.theme).toBe('neo-theme-neo-light');
        expect(adopted.cls, 'it differs from the physical parent, so it carries its class').toContain('neo-theme-neo-light')
    });

    /**
     * Live panes move between containers instead of being recreated. A theme an instance only inherited must
     * follow it into the next container, or its descendants resolve the old scope through `getTheme()`; a
     * theme of its own, one that differed from the old container's, stays.
     */
    test('an inherited theme follows the instance into the container it moves to; its own theme does not', () => {
        const
            light = Neo.create(Container, {appName, theme: 'neo-theme-neo-light'}),
            dark  = Neo.create(Container, {appName, theme: 'neo-theme-neo-dark'});

        container = Neo.create(Container, {appName, theme: 'neo-theme-neo-dark'});

        try {
            const
                inherited = Neo.create(Container, {appName, items: [{module: Component}]}),
                own       = Neo.create(Component, {appName, theme: 'neo-theme-neo-light'});

            container.add([inherited, own]);

            light.add(inherited);

            expect(inherited.theme, 'the theme it inherited from its old container').toBe('neo-theme-neo-light');
            expect(inherited.items[0].theme, 'and its subtree').toBe('neo-theme-neo-light');
            expect(inherited.cls, 'inherited from the new physical parent: no local carrier').not.toContain('neo-theme-neo-light');

            dark.add(own);

            expect(own.theme, 'a theme of its own').toBe('neo-theme-neo-light')
        } finally {
            light.destroy();
            dark.destroy()
        }
    })
});
