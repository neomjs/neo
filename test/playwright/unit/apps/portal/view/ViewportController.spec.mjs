import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalViewportControllerTest'
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../../src/Neo.mjs';
import * as core          from '../../../../../../src/core/_export.mjs';
import Component          from '../../../../../../src/component/Base.mjs';
import ViewportController from '../../../../../../apps/portal/view/ViewportController.mjs';

/**
 * `onSwitchTheme` awaits a REMOTE method before applying the theme. The engine itself resolves
 * rather than rejects — `startViewTransition` returns false without the View Transition API and
 * catches a failed reveal internally — but the worker-side call is a proxy, and its transport can
 * reject for reasons the main-thread method never observes.
 *
 * The reveal is decorative. Losing it must cost an animation, never the theme change, so these arms
 * pin the flip against every way the awaited call can fail.
 */
test.describe('Portal.view.ViewportController — the theme switch survives its decorative reveal', () => {
    /**
     * Runs `onSwitchTheme` against a stubbed engine and reports what the theme did.
     * @param {Object} config {bootTheme, data, reject, startResult, startingTheme}
     * @returns {Promise<Object>} {calls, themeAfter, threw}
     */
    async function switchThemeWith({bootTheme = null, data = {clientX: 40, clientY: 12}, noEvent = false, reject = false, startResult = true, startingTheme = 'neo-theme-neo-light'} = {}) {
        const
            originalDomAccess = Neo.main.DomAccess,
            domAccess         = originalDomAccess ?? Neo.ns('Neo.main.DomAccess', true),
            originalStart     = domAccess.startViewTransition,
            originalThemes    = Neo.config.themes,
            calls             = [];

        let themeAfter = null,
            threw      = null;

        domAccess.startViewTransition = async payload => {
            calls.push(payload);

            if (reject) {
                throw new Error('remote round trip rejected')
            }

            return startResult
        };

        // The SHIPPED method, run against the minimal `this` it actually reads. Constructing the
        // controller would boot the viewport's services (the SEO fetch among them) to exercise five
        // lines, and the extra machinery would be noise this arm cannot fail on meaningfully.
        // The component carries the engine's real `getTheme()`, so a viewport whose `theme` is
        // still null resolves the boot theme exactly the way the shipped Portal does.
        const context = {
            component: {cls: [], getTheme: Component.prototype.getTheme, parent: null, theme: startingTheme, windowId: 1},
            windowId : 1,
            setTheme : theme => {themeAfter = theme}
        };

        if (bootTheme) {
            Neo.config.themes = [bootTheme]
        }

        try {
            // `noEvent` calls with NO argument, which is the real shape. Passing `data: undefined`
            // would hit this helper's own default and silently test the with-pointer case instead.
            await (noEvent
                ? ViewportController.prototype.onSwitchTheme.call(context)
                : ViewportController.prototype.onSwitchTheme.call(context, data))
        } catch (error) {
            threw = error
        } finally {
            originalStart
                ? domAccess.startViewTransition = originalStart
                : delete domAccess.startViewTransition;

            Neo.config.themes = originalThemes
        }

        return {calls, themeAfter, threw}
    }

    test('a rejected remote round trip still switches the theme', async () => {
        const {themeAfter, threw} = await switchThemeWith({reject: true});

        expect(threw, 'a decorative reveal must never take the theme switch down with it').toBeNull();
        expect(themeAfter, 'the theme switches even when the transition never happened').toBe('neo-theme-neo-dark')
    });

    test('a browser without the View Transition API still switches the theme', async () => {
        const {themeAfter, threw} = await switchThemeWith({startResult: false});

        expect(threw, 'a false return is the documented no-API answer, not a failure').toBeNull();
        expect(themeAfter, 'the pre-existing floor: the theme switches either way').toBe('neo-theme-neo-dark')
    });

    test('the pointer reaches the engine, which owns the reveal geometry', async () => {
        const {calls} = await switchThemeWith({data: {clientX: 40, clientY: 12}});

        expect(calls, 'the engine transition must actually have been requested').toHaveLength(1);
        expect(calls[0].reveal, 'raw coordinates travel; no radius is computed in the app').toEqual({x: 40, y: 12});
        expect(calls[0].delay, 'the caller declares its own capture window').toBe(100)
    });

    test('a switch with no event neither throws nor invents a reveal origin', async () => {
        // Undefined coordinates are how `createRevealAnimation` is told there is no origin — it
        // returns null and the transition runs as the browser's default cross-fade. A fabricated
        // origin would paint a circle from a place nobody clicked.
        const {calls, themeAfter, threw} = await switchThemeWith({noEvent: true});

        expect(threw, 'a missing event must not reach the engine as a crash').toBeNull();
        expect(calls[0].reveal, 'no origin is fabricated').toEqual({x: undefined, y: undefined});
        expect(themeAfter, 'and the switch still happens').toBe('neo-theme-neo-dark')
    });

    test('the switch reverses out of the dark theme', async () => {
        // The direction the other arms never exercise: a controller that starts dark must resolve
        // light, or a one-way switch would pass every assertion above.
        const {themeAfter} = await switchThemeWith({startingTheme: 'neo-theme-neo-dark'});

        expect(themeAfter, 'the toggle is a toggle, not a one-way trip').toBe('neo-theme-neo-light')
    });

    test('the first click on a fresh dark boot switches to light', async () => {
        // #19902: the Portal boots `neo-theme-neo-dark` (themes[0]) and `viewport.theme` stays null
        // until the first switch. Assuming light here made the first click "switch" to the dark
        // theme already on screen, so nothing visibly happened until the second click.
        const {themeAfter} = await switchThemeWith({bootTheme: 'neo-theme-neo-dark', startingTheme: null});

        expect(themeAfter, 'one click leaves the boot theme').toBe('neo-theme-neo-light')
    });

    test('the first click on a fresh light boot switches to dark', async () => {
        const {themeAfter} = await switchThemeWith({bootTheme: 'neo-theme-neo-light', startingTheme: null});

        expect(themeAfter, 'the fallback follows the boot theme, not a hardcoded one').toBe('neo-theme-neo-dark')
    })
});

test.describe('Portal.view.ViewportController — the theme button icon matches the theme on screen', () => {
    /**
     * Runs a controller method against a stub button and reports the icon it ends up with.
     * @param {String} method
     * @param {String} theme
     * @returns {String}
     */
    function iconAfter(method, theme) {
        const btn = {iconCls: 'fa-solid fa-moon'};

        const context = {
            component            : {},
            getReference         : ref => ref === 'theme-switch-button' ? btn : null,
            updateThemeSwitchIcon: ViewportController.prototype.updateThemeSwitchIcon,
            windowId             : 1
        };

        ViewportController.prototype[method].call(context, theme, false);

        return btn.iconCls
    }

    test('a dark theme on screen shows the sun', () => {
        // The Portal's button starts as a moon, but it boots dark. This sync is what the
        // no-stored-theme path in `onConstructed` runs, so the first icon is right as well.
        expect(iconAfter('updateThemeSwitchIcon', 'neo-theme-neo-dark')).toBe('fa-solid fa-sun')
    });

    test('a light theme on screen shows the moon', () => {
        expect(iconAfter('updateThemeSwitchIcon', 'neo-theme-neo-light')).toBe('fa-solid fa-moon')
    });

    test('setTheme keeps the icon in step with every switch', () => {
        expect(iconAfter('setTheme', 'neo-theme-neo-dark')).toBe('fa-solid fa-sun');
        expect(iconAfter('setTheme', 'neo-theme-neo-light')).toBe('fa-solid fa-moon')
    })
});
