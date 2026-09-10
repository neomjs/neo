/**
 * @file test/playwright/unit/component/CanvasColorScheme.spec.mjs
 * @summary Pins how a canvas answers light-or-dark: through the component chain, from a declared
 * map, and into the payload a renderer actually receives.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'CanvasColorSchemeTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Canvas          from '../../../../src/component/Canvas.mjs';
import Container       from '../../../../src/container/Base.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Sparkline       from '../../../../src/component/Sparkline.mjs';

const appName = 'CanvasColorSchemeTest';

/**
 * @summary A container whose class default names a theme, so children inherit it through the
 * class-default rung of item creation and carry no theme of their own — the shape the defect lived in.
 */
class ThemedScope extends Container {
    static config = {
        className: 'Neo.test.component.CanvasColorScheme.ThemedScope',
        theme    : 'neo-theme-neo-dark'
    }
}

ThemedScope = Neo.setupClass(ThemedScope);

/**
 * The scheme each shipped theme declares as `--neo-color-scheme` in its own `Global.scss`.
 * `neo-theme-cyberpunk` is the row that matters: it is dark, its name says nothing, and a substring
 * test on the name answers `light` for it.
 */
const SHIPPED_THEMES = [
    ['neo-theme-cyberpunk', 'dark'],
    ['neo-theme-dark',      'dark'],
    ['neo-theme-light',     'light'],
    ['neo-theme-neo-dark',  'dark'],
    ['neo-theme-neo-light', 'light']
];

test.describe('Neo.component.Canvas#resolveColorScheme', () => {
    let instance = null;

    test.afterEach(() => {
        instance?.destroy();
        instance = null
    });

    SHIPPED_THEMES.forEach(([theme, scheme]) => {
        test(`${theme} resolves ${scheme}`, () => {
            instance = Neo.create(Canvas, {appName, theme});

            expect(instance.resolveColorScheme()).toBe(scheme)
        })
    });

    test('a theme the map does not carry keeps the light default, so adding one cannot repaint an app', () => {
        instance = Neo.create(Canvas, {appName, theme: 'neo-theme-not-shipped-by-neo'});

        expect(instance.resolveColorScheme()).toBe('light')
    });

    test('a canvas inside a themed scope answers the scope, while declaring no theme of its own', () => {
        instance = Neo.create(ThemedScope, {
            appName,
            items: [{module: Canvas, reference: 'canvas'}]
        });

        const canvas = instance.getReference('canvas');

        expect(canvas.resolveColorScheme(), 'the scope decides').toBe('dark');

        // Then the defect's own shape. `container.Base#afterSetTheme` stamps live items on a CHANGE
        // and leaves construction to `createItem`, so on the paths where the config never lands it
        // stays empty while the chain still knows the answer. That state is observed, not just
        // constructed: three live editors inside the portal's themed viewport measured `theme: null`
        // with `getTheme()` returning `'neo-theme-neo-dark'`, through a markdown → tab → wrapper
        // chain. Emptied explicitly here because this tier has no such chain to build.
        canvas.theme = null;

        expect(canvas.theme, 'the config a canvas used to read is empty').toBeNull();
        expect(canvas.resolveColorScheme(), 'and the answer is unchanged').toBe('dark')
    });

    test('a canvas declaring its own theme is not overruled by the scope it sits in', () => {
        instance = Neo.create(ThemedScope, {
            appName,
            items: [{module: Canvas, reference: 'canvas', theme: 'neo-theme-neo-light'}]
        });

        expect(instance.getReference('canvas').resolveColorScheme()).toBe('light')
    })
});

test.describe('a canvas hands the resolved scheme to its renderer', () => {
    const RENDERER_NS = 'Neo.test.canvas.ColorSchemeDouble';

    let calls          = [],
        instance       = null,
        originalCanvas = null;

    test.beforeEach(() => {
        calls = [];

        Object.assign(Neo.ns(RENDERER_NS, true), {
            register    : async data => {calls.push(['register', data])},
            unregister  : async () => {},
            updateConfig: data => {calls.push(['updateConfig', data])},
            updateData  : () => {},
            updateSize  : () => {}
        });

        // `Canvas#destroy` unregisters through the Canvas Worker, which the unit engine does not
        // start. Without this the teardown throws and the failure reads as the arm's, not the rig's.
        originalCanvas    = Neo.worker.Canvas;
        Neo.worker.Canvas = {unregisterCanvas: () => {}}
    });

    test.afterEach(() => {
        instance?.destroy();
        instance = null;

        if (originalCanvas === undefined) {
            delete Neo.worker.Canvas
        } else {
            Neo.worker.Canvas = originalCanvas
        }

        delete Neo.test?.canvas?.ColorSchemeDouble
    });

    test('the registration payload carries the scope theme, with no theme change in between', async () => {
        instance = Neo.create(ThemedScope, {
            appName,
            items: [{
                module           : Sparkline,
                reference        : 'sparkline',
                rendererClassName: RENDERER_NS
            }]
        });

        const sparkline = instance.getReference('sparkline');

        // Empty the config FIRST, or this arm cannot fail on the resolution axis: `createItem`
        // populates an inherited theme on this path, so a resolver reading the config would answer
        // correctly here and the arm would witness only the mapping. The shape below is the one
        // measured in production — three live editors inside the portal's themed viewport, each
        // `theme: null` while `getTheme()` returned the dark theme.
        sparkline.theme = null;

        // Registration is where the component last controls the value. The rendered pixel is not
        // reachable from here — `main/DomAccess.mjs` transfers the canvas with
        // `transferControlToOffscreen()`, after which the owning thread cannot read it — so this
        // payload is the assertion boundary, and it is the value that was wrong.
        sparkline.offscreenRegistered = true;
        await sparkline.timeout(1);

        const register = calls.find(([name]) => name === 'register');

        expect(register, 'the renderer was registered').toBeTruthy();
        expect(register[1].theme, 'and the first payload is already dark').toBe('dark')
    });

    test('both directions on one instance, including a dark theme whose name says nothing', async () => {
        instance = Neo.create(ThemedScope, {
            appName,
            items: [{
                module           : Sparkline,
                reference        : 'sparkline',
                rendererClassName: RENDERER_NS
            }]
        });

        const
            sparkline = instance.getReference('sparkline'),
            lastTheme = () => calls.filter(([name]) => name === 'updateConfig').at(-1)?.[1].theme;

        sparkline.offscreenRegistered = true;
        await sparkline.timeout(1);

        // Light is the direction a component hardcoded to `dark` fails, which is the mirror of the
        // bug: asserting only the dark half passes against the wrong implementation.
        instance.theme = 'neo-theme-neo-light';
        await sparkline.timeout(1);
        expect(lastTheme(), 'a live theme change reaches the renderer').toBe('light');

        instance.theme = 'neo-theme-cyberpunk';
        await sparkline.timeout(1);
        expect(lastTheme(), 'and a dark theme that is not named dark still reads dark').toBe('dark')
    })
});
