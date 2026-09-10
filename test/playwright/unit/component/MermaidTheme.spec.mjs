/**
 * @file test/playwright/unit/component/MermaidTheme.spec.mjs
 * @summary Pins how a mermaid diagram answers which theme to draw in: through the component chain,
 * from its declared map, and into the front matter the addon actually receives.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'MermaidThemeTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Container      from '../../../../src/container/Base.mjs';
import Mermaid        from '../../../../src/component/wrapper/Mermaid.mjs';

// Imported for its side effect and named by nothing below: `manager/Instance.mjs:37` assigns
// `Neo.get`, which `component/Abstract.mjs:369` needs to walk to a parent — and container teardown
// walks it. Without this line every arm that nests a diagram in a scope passes and then throws in
// `afterEach`, which reads as the arm's failure rather than the rig's.
import '../../../../src/manager/Instance.mjs';

const appName = 'MermaidThemeTest';

/**
 * @summary A container whose class default names a theme, so children inherit it through the
 * class-default rung of item creation and carry no theme of their own — the shape the defect lived in.
 */
class ThemedScope extends Container {
    static config = {
        className: 'Neo.test.component.MermaidTheme.ThemedScope',
        theme    : 'neo-theme-neo-dark'
    }
}

ThemedScope = Neo.setupClass(ThemedScope);

/**
 * The mermaid theme each shipped Neo theme declares in `Mermaid#themeMap`. `neo-theme-cyberpunk` is
 * the row that matters most: it is dark, and its name says nothing that a substring test could read.
 * Note mermaid's light theme is named `default`, which is also the unmapped fallback — so the light
 * rows and the fallback are asserted separately below rather than being read off one another.
 */
const SHIPPED_THEMES = [
    ['neo-theme-cyberpunk', 'dark'],
    ['neo-theme-dark',      'dark'],
    ['neo-theme-light',     'default'],
    ['neo-theme-neo-dark',  'dark'],
    ['neo-theme-neo-light', 'default']
];

test.describe('Neo.component.wrapper.Mermaid#resolveTheme', () => {
    let instance = null;

    test.afterEach(() => {
        instance?.destroy();
        instance = null
    });

    SHIPPED_THEMES.forEach(([theme, mermaidTheme]) => {
        test(`${theme} resolves ${mermaidTheme}`, () => {
            instance = Neo.create(Mermaid, {appName, theme});

            expect(instance.resolveTheme()).toBe(mermaidTheme)
        })
    });

    test('a theme the map does not carry keeps the default, so shipping one cannot repaint a diagram', () => {
        instance = Neo.create(Mermaid, {appName, theme: 'neo-theme-not-shipped-by-neo'});

        expect(instance.resolveTheme()).toBe('default')
    });

    test('a diagram inside a themed scope answers the scope, while declaring no theme of its own', () => {
        instance = Neo.create(ThemedScope, {
            appName,
            items: [{module: Mermaid, reference: 'mermaid'}]
        });

        const mermaid = instance.getReference('mermaid');

        expect(mermaid.resolveTheme(), 'the scope decides').toBe('dark');

        // Then the defect's own shape. `container.Base#afterSetTheme` stamps live items on a CHANGE
        // and leaves construction to `createItem`, so on the paths where the config never lands it
        // stays empty while the chain still knows the answer. Emptied explicitly because this tier
        // has no markdown -> tab -> wrapper chain to build, and without it the arm witnesses only
        // the mapping — the same trap `CanvasColorScheme.spec.mjs` records for the canvas family.
        mermaid.theme = null;

        expect(mermaid.theme, 'the config a diagram used to read is empty').toBeNull();
        expect(mermaid.resolveTheme(), 'and the answer is unchanged').toBe('dark')
    });

    test('a diagram declaring its own theme is not overruled by the scope it sits in', () => {
        instance = Neo.create(ThemedScope, {
            appName,
            items: [{module: Mermaid, reference: 'mermaid', theme: 'neo-theme-neo-light'}]
        });

        expect(instance.getReference('mermaid').resolveTheme()).toBe('default')
    });

    test('an explicit mermaidTheme wins over the resolved one, including a mermaid theme Neo never maps', () => {
        instance = Neo.create(ThemedScope, {
            appName,
            items: [{module: Mermaid, mermaidTheme: 'forest', reference: 'mermaid'}]
        });

        const mermaid = instance.getReference('mermaid');

        expect(mermaid.getTheme(), 'the scope is dark').toBe('neo-theme-neo-dark');
        expect(mermaid.resolveTheme(), 'and the explicit value still wins').toBe('forest')
    })
});

test.describe('a diagram hands the resolved theme to its addon', () => {
    /**
     * The rendered SVG is not reachable from here — mermaid draws it in the Main thread addon — so
     * the front matter this component emits is the assertion boundary, and it is the value that was
     * wrong. Reading the theme back out by pattern rather than `toContain`, because a substring test
     * is how the sibling editor arm went green against a wrong value: `'vs-dark'.includes('vs')` is
     * true, so the poll returned on its first evaluation while the editor was still dark.
     * @param {String} code
     * @returns {String|undefined}
     */
    const frontMatterTheme = code => code.match(/^---\nconfig:\n {2}theme: (.+)\n---\n/)?.[1];

    let calls    = [],
        instance = null;

    test.beforeEach(() => {
        calls = []
    });

    test.afterEach(() => {
        instance?.destroy();
        instance = null
    });

    /**
     * Mounts one diagram inside a themed scope and returns the front matter of its FIRST render.
     * @param {String} theme
     * @returns {Promise<String|undefined>}
     */
    async function firstRenderTheme(theme) {
        class Scope extends ThemedScope {
            static config = {
                className: `Neo.test.component.MermaidTheme.Scope.${theme}`,
                theme
            }
        }

        Neo.setupClass(Scope);

        instance = Neo.create(Scope, {
            appName,
            items: [{module: Mermaid, reference: 'mermaid', value: 'graph TD;\n  A-->B;'}]
        });

        const mermaid = instance.getReference('mermaid');

        // `initAsync` assigns the addon, so the double has to replace it afterwards or it is
        // overwritten the moment the instance becomes ready.
        await mermaid.ready();

        // Empty the config FIRST, or this arm cannot fail on the resolution axis.
        mermaid.theme = null;
        mermaid.addon = {render: async data => {calls.push(data)}};

        // Mounting is the first-render trigger, and the one path the theme config never reaches:
        // `afterSetTheme` is the only trigger that carries a value, because it IS the new value.
        mermaid.mounted = true;
        await mermaid.timeout(1);

        return frontMatterTheme(calls.at(-1)?.code)
    }

    test('the first render inside a dark scope is already dark, with no theme change in between', async () => {
        expect(await firstRenderTheme('neo-theme-neo-dark')).toBe('dark')
    });

    // The mirror, and it is worth being exact about what it can and cannot catch. It separates a
    // resolver from a constant `dark`, which the arm above cannot. It does NOT witness the
    // resolution axis: under the defect `themeMap[null]` is `undefined` and the `||` answers
    // `'default'` — the same value a correct light resolution returns — so this arm stays green
    // against the very bug this file exists for. The dark arms are the discriminating ones.
    test('and the first render inside a light scope is default', async () => {
        expect(await firstRenderTheme('neo-theme-neo-light')).toBe('default')
    });

    test('a dark scope whose name says nothing still renders dark', async () => {
        expect(await firstRenderTheme('neo-theme-cyberpunk')).toBe('dark')
    })
});
