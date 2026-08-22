import {test, expect} from '@playwright/test';

/**
 * The rail tab's paint, measured on a rendered tab rather than on stylesheet text.
 *
 * The sibling `dockRailTabLayering.spec.mjs` proves the engine rule OUTRANKS the theme's generic
 * `.neo-button` floor by comparing compiled selectors. That is the cascade question. This file
 * answers the one a compiled comparison cannot: what a browser actually computes once the theme
 * variables resolve.
 *
 * The regression it exists for is concrete. The neo themes floor every `.neo-button` at
 * `min-width: var(--cmp-button-height)` (48px). On a 14px vertical rail that floor pushes the
 * rotated label outside the clipped strip and the tab renders as an empty pill. Both consuming
 * apps had been carrying their own higher-specificity `min-width: 0` to escape it; the engine now
 * owns that release, so nothing app-side is left to prove it still works.
 *
 * **The control is the point.** `min-width: 0px` on a rail tab only means the engine won if the
 * 48px floor was actually live in the same document — otherwise a theme stylesheet that simply
 * failed to load reads as a pass. Every arm therefore measures a plain sibling button first and
 * requires it to be AT the floor.
 *
 * @see https://github.com/neomjs/neo/issues/17522
 */

const THEMES = ['neo-theme-neo-dark', 'neo-theme-neo-light'];

let dashboardId, railId;

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-rail/index.html');
    await page.waitForSelector('#dock-rail-test-viewport', {state: 'attached'});

    const ids = await page.evaluate(async () => {
        // The REAL dashboard container, not a plain one wearing `.neo-dashboard`. Neo loads a
        // class's stylesheet when the class is instantiated, so faking the ancestor class leaves
        // `src/dashboard/Container.css` — the file that carries the rule under test — out of the
        // document entirely, and every arm below then measures the generic button skin.
        const dashboard = await Neo.worker.App.createNeoInstance({
            importPath: '../dashboard/Container.mjs',
            // `createNeoInstance` imports the module but resolves the class through the ntype
            // registry — a config without one reaches `parent.add()` with nothing to construct.
            ntype   : 'dashboard',
            parentId: 'dock-rail-test-viewport'
        });

        if (!dashboard.success) throw new Error(`dashboard: ${dashboard.error.message}`);

        const rail = await Neo.worker.App.createNeoInstance({
            importPath: '../dashboard/DockRail.mjs',
            ntype     : 'dashboard-dock-rail',
            edge      : 'left',
            parentId  : dashboard.id,
            railItems : [
                {dockEdge: 'left', dockItemId: 'alpha', restorable: true, title: 'Alpha'},
                {dockEdge: 'left', dockItemId: 'beta',  restorable: true, title: 'Beta'}
            ]
        });

        if (!rail.success) throw new Error(`rail: ${rail.error.message}`);

        return {dashboardId: dashboard.id, railId: rail.id}
    });

    ({dashboardId, railId} = ids);

    await page.waitForSelector('.neo-dashboard-dock-rail-tab', {state: 'attached'})
});

test.afterEach(async ({page}) => {
    await page.evaluate(async ids => {
        for (const id of ids) id && await Neo.worker.App.destroyNeoInstance(id)
    }, [railId, dashboardId])
});

/** Swap the active theme class on the document element and read back what took effect. */
const applyTheme = (page, theme) => page.evaluate(name => {
    for (const el of [document.body, document.documentElement]) {
        el.classList.forEach(c => c.startsWith('neo-theme-') && el.classList.remove(c))
    }

    document.body.classList.add(name);

    return document.body.className
}, theme);

test.describe('Neo.dashboard.DockRail — rendered rail-tab paint', () => {
    for (const theme of THEMES) {
        test(`the engine's min-width release survives the ${theme} button floor`, async ({page}) => {
            await applyTheme(page, theme);

            const measured = await page.evaluate(() => {
                const tab = document.querySelector('.neo-dashboard-dock-rail-tab');

                // A plain button OUTSIDE the dashboard: same theme, same document, but no engine
                // rule reaching it. This is the control that makes the tab's value meaningful.
                const control = document.createElement('button');

                control.className = 'neo-button';
                document.body.appendChild(control);

                const result = {
                    tabMinWidth    : getComputedStyle(tab).minWidth,
                    controlMinWidth: getComputedStyle(control).minWidth,
                    tabFound       : Boolean(tab)
                };

                control.remove();

                return result
            });

            expect(measured.tabFound, 'a rail tab must be rendered').toBe(true);

            // Control first: if the floor is not live, nothing below proves anything.
            expect(measured.controlMinWidth,
                `${theme} must actually floor a plain button — otherwise this arm is vacuous`)
                .not.toBe('0px');
            expect(parseFloat(measured.controlMinWidth),
                'the floor is the 48px button height').toBeGreaterThan(24);

            // The measurement.
            expect(measured.tabMinWidth,
                'the engine rule must beat the theme floor on a rendered tab').toBe('0px')
        })
    }

    test('an app token value reaches the tab, and only the subtree that sets it', async ({page}) => {
        await applyTheme(page, 'neo-theme-neo-dark');

        // Two rails in two subtrees, and a rule shaped exactly the way a consuming app writes one:
        // the token lands on the TAB's own selector under an app-root class, which is what
        // `Workspace.scss` and `FleetCockpit.scss` both do. Setting the property on an ancestor
        // instead would test a mechanism no app uses — and does not even work, because the engine
        // re-declares the token defaults on every `.neo-dashboard`, including nested projected
        // zones, so an outer value is shadowed before it reaches the tab.
        const measured = await page.evaluate(async () => {
            const dashboard = document.querySelector('.neo-dashboard'),
                  sibling   = dashboard.cloneNode(true),
                  style     = document.createElement('style'),
                  freeze    = document.createElement('style');

            // The engine rule TRANSITIONS `color`. Reading straight after the class flip returns
            // the start value, and reading a frame later returns a blend — measured at
            // rgb(244, 172, 171) on the way to red. Both are green-looking wrong answers, and a
            // fixed sleep would only make the flake slower, so the transition is switched off for
            // the measurement instead.
            freeze.textContent = '* { transition: none !important }';
            document.head.appendChild(freeze);

            sibling.id = 'sibling-dashboard';
            dashboard.parentElement.appendChild(sibling);

            const read = () => ({
                scoped : getComputedStyle(dashboard.querySelector('.neo-dashboard-dock-rail-tab')).color,
                sibling: getComputedStyle(sibling.querySelector('.neo-dashboard-dock-rail-tab')).color
            });

            const before = read();

            style.textContent =
                '.test-app-a .neo-button.neo-dashboard-dock-rail-tab { --dock-rail-tab-color: rgb(255, 0, 0) }';
            document.head.appendChild(style);
            dashboard.classList.add('test-app-a');

            const after = read();

            style.remove();
            freeze.remove();
            sibling.remove();

            return {before, after}
        });

        expect(measured.after.scoped, 'the token must reach the tab that sets it')
            .toBe('rgb(255, 0, 0)');
        expect(measured.after.sibling, 'and must not leak into a sibling subtree')
            .toBe(measured.before.sibling);
        expect(measured.before.scoped, 'the change must be observable — equal before/after proves nothing')
            .not.toBe(measured.after.scoped)
    })
});
