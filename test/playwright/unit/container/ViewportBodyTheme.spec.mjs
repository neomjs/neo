import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ViewportBodyThemeTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Viewport       from '../../../../src/container/Viewport.mjs';

const appName = 'ViewportBodyThemeTest';

/**
 * `Neo.container.Viewport` publishes its theme onto `document.body`, because the body class is written
 * once at main-thread boot from `Neo.config.themes[0]` and nothing in the theme path rewrote it. These
 * arms pin WHEN it publishes and WHAT it publishes, at the main-thread boundary rather than through a
 * rendered page — the rendered half is covered by `e2e/portal/StoredThemeBoot.spec.mjs`.
 *
 * The transition that matters here is the one boot cases structurally cannot reach: `theme_: null` is a
 * supported state meaning "inherit", so a reset from an explicit theme must republish what `getTheme()`
 * now resolves. Reading the `theme` CONFIG instead of the effective theme leaves the body on the last
 * explicit value while every other surface has moved on — the same two-surface disagreement the publisher
 * exists to remove, arriving through its own fix.
 */
test.describe('Neo.container.Viewport — body-theme publication', () => {
    let calls    = [],
        original = null,
        viewport = null;

    test.beforeEach(() => {
        calls = [];

        Neo.main            ??= {};
        Neo.main.DomAccess  ??= {};
        original              = {
            applyBodyCls: Neo.main.DomAccess.applyBodyCls,
            setBodyCls  : Neo.main.DomAccess.setBodyCls
        };

        Neo.main.DomAccess.applyBodyCls = () => {};
        Neo.main.DomAccess.setBodyCls   = data => calls.push(data)
    });

    test.afterEach(() => {
        viewport?.destroy();
        viewport = null;

        Neo.main.DomAccess.applyBodyCls = original.applyBodyCls;
        Neo.main.DomAccess.setBodyCls   = original.setBodyCls
    });

    /** @returns {String|null} the theme the last publication put on the body */
    const published = () => calls.at(-1)?.add?.[0] ?? null;

    test('an explicit theme at construction is published once', () => {
        viewport = Neo.create(Viewport, {appName, autoMount: false, theme: 'neo-theme-neo-light'});

        expect(calls).toHaveLength(1);
        expect(published()).toBe('neo-theme-neo-light');
        expect(viewport.getTheme()).toBe('neo-theme-neo-light');
    });

    test('a reset to inheritance republishes the effective theme, not the last explicit one', () => {
        viewport = Neo.create(Viewport, {appName, autoMount: false, theme: 'neo-theme-neo-light'});

        expect(published(), 'the explicit theme lands first').toBe('neo-theme-neo-light');

        viewport.theme = null;

        // `getTheme()` walks to the window/app default once the config is cleared. The body has to follow
        // it: reading `theme` here returns null, and skipping on null is what left the body on light.
        const effective = viewport.getTheme();

        expect(effective, 'the viewport falls back to the app default').toBe(Neo.config.themes[0]);
        expect(calls, 'the reset publishes rather than being skipped').toHaveLength(2);
        expect(published(), 'and the two surfaces agree again').toBe(effective);
    });

    test('an explicit theme change also republishes — the working control for the reset arm', () => {
        viewport = Neo.create(Viewport, {appName, autoMount: false, theme: 'neo-theme-neo-light'});

        viewport.theme = 'neo-theme-neo-dark';

        // Without this arm a reset arm could pass against a publisher that never fires at all.
        expect(calls).toHaveLength(2);
        expect(published()).toBe('neo-theme-neo-dark');
        expect(viewport.getTheme()).toBe('neo-theme-neo-dark');
    });

    test('a viewport that never carries a theme publishes nothing', () => {
        viewport = Neo.create(Viewport, {appName, autoMount: false});

        // The untouched default already agrees with the body, and this path must not start depending on
        // the publisher. An implementation that published `getTheme()` unconditionally passes every arm
        // above and fails this one.
        expect(calls).toHaveLength(0);
    });

    test('applyBodyCls:false opts out even with an explicit theme', () => {
        viewport = Neo.create(Viewport, {
            appName,
            applyBodyCls: false,
            autoMount   : false,
            theme       : 'neo-theme-neo-light'
        });

        viewport.theme = null;

        expect(calls).toHaveLength(0);
    })
});
