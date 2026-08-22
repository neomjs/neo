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

    /**
     * The two real consuming apps, loaded as the COMPILED stylesheets they ship as.
     *
     * The synthetic `.test-app-a` arm above proves the engine's token PLUMBING works. It cannot
     * prove either app's own rule reaches it, because a rule authored in a spec is a rule nobody
     * ships. These link `dist/**\/css/**` — the same artifacts Neo loads at runtime — plus the
     * theme-scoped token layer the app's values reference, because `--workstation-signal` and
     * `--fm-ink-dim` are declared under `:root .neo-theme-neo-*` and NOT in the app stylesheet.
     * Loading the rule alone leaves every `var()` an invalid substitution and the tab quietly
     * computes the engine default while the arm reports on the app.
     */
    const APP_IDENTITIES = [{
        inkHover  : '--workstation-ink',
        inkResting: '--workstation-ink-dim',
        name      : 'workstation',
        // Only workstation declares `--dock-rail-tab-font-family`; FM leaves the engine's
        // `inherit` in place, and that difference is itself a value meant to stay unchanged.
        ownsVoice: true,
        rootCls  : 'workstation-workspace',
        rule     : '/dist/development/css/src/apps/workstation/Workspace.css',
        tokens   : theme => `/dist/development/css/${theme.replace('neo-theme-', 'theme-')}/apps/workstation/Viewport.css`
    }, {
        inkHover  : '--fm-ink',
        inkResting: '--fm-ink-dim',
        name      : 'FM',
        ownsVoice : false,
        rootCls   : 'fm-fleet-cockpit',
        rule      : '/dist/development/css/src/apps/agentos/fleet/FleetCockpit.css',
        tokens    : theme => `/dist/development/css/${theme.replace('neo-theme-', 'theme-')}/apps/agentos/Viewport.css`
    }];

    /** Links stylesheets into the document, rejecting loudly when one is missing. */
    const loadStylesheets = (page, hrefs) => page.evaluate(async hrefs => {
        // The engine rule TRANSITIONS `color`. Reading straight after a hover returns the start
        // value and a frame later returns a blend — both green-looking wrong answers, and a fixed
        // sleep would only make the flake slower.
        const freeze = document.createElement('style');

        freeze.textContent = '*, *::after, *::before { transition: none !important }';
        document.head.appendChild(freeze);

        for (const href of hrefs) {
            const link = document.createElement('link');

            link.rel  = 'stylesheet';
            link.href = href;

            // A missing artifact must be a loud red. Skipping it silently would leave the app's
            // tokens undefined, and the arm would then measure the ENGINE floor under the app's name.
            await new Promise((resolve, reject) => {
                link.onload  = resolve;
                link.onerror = () => reject(new Error(`stylesheet did not load: ${href}`));
                document.head.appendChild(link)
            })
        }
    }, hrefs);

    /** The five properties the close target names, resting and hovered. */
    const readTabPaint = (page, selector, tokens = []) => page.evaluate(({sel, tokens}) => {
        const tab   = document.querySelector(sel),
              style = getComputedStyle(tab);

        /**
         * The browser's own serialisation of a colour, so a comparison is apples-to-apples.
         *
         * A custom property comes back verbatim (`#8b97a8`) while `color` comes back serialised
         * (`rgb(139, 151, 168)`). String-comparing those two reports a parity FAILURE on identical
         * colours — a false red as misleading as a false green.
         */
        const resolveColor = value => {
            if (!value) return '';

            const probe = document.createElement('div');

            probe.style.color = value;
            document.body.appendChild(probe);

            const resolved = getComputedStyle(probe).color;

            probe.remove();

            return resolved
        };

        return {
            background: style.backgroundColor,
            border    : `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
            boxShadow : style.boxShadow,
            color     : style.color,
            fontFamily: style.fontFamily,
            resolved  : Object.fromEntries(tokens.map(name =>
                [name, resolveColor(style.getPropertyValue(name).trim())]))
        }
    }, {sel: selector, tokens});

    for (const identity of APP_IDENTITIES) {
        for (const theme of THEMES) {
            test(`${identity.name} rail-tab paint, resting and hovered — ${theme}`, async ({page}) => {
                await applyTheme(page, theme);
                await loadStylesheets(page, [identity.tokens(theme), identity.rule]);
                await page.evaluate(cls => document.querySelector('.neo-dashboard').classList.add(cls),
                    identity.rootCls);

                const tab = page.locator('.neo-dashboard-dock-rail-tab').first();

                await page.mouse.move(0, 0);

                const
                    inkTokens = [identity.inkResting, identity.inkHover],
                    resting   = await readTabPaint(page, '.neo-dashboard-dock-rail-tab', inkTokens);

                await tab.hover();

                const hovered = await readTabPaint(page, '.neo-dashboard-dock-rail-tab', inkTokens);

                // PARITY, per state, against the app's OWN palette token — which is what these
                // tabs computed before the promotion, when the app declared `color` directly.
                //
                // An earlier version asserted only `resting.color !== hovered.color` and called
                // that "the app's ink reaches the tab". It did not: deleting the engine's resting
                // `color: var(--dock-rail-tab-color)` left the arm GREEN, because the separate
                // hover rule still moved the value. Two states differing proves neither of them
                // came from where the arm claims.
                expect(resting.color, `${identity.name} resting ink is ${identity.inkResting}`)
                    .toBe(resting.resolved[identity.inkResting]);
                expect(hovered.color, `${identity.name} hover ink is ${identity.inkHover}`)
                    .toBe(hovered.resolved[identity.inkHover]);

                // The hover affordance is the rail's whole navigation read.
                expect(hovered.background, 'hover lifts the tab out of the strip')
                    .not.toBe(resting.background);

                // Values meant to stay UNCHANGED by identity: structural paint stays engine-neutral
                // in both states. An app that re-declared border or shadow would be back in the
                // equal-specificity tie this promotion dissolved.
                for (const [state, reading] of Object.entries({resting, hovered})) {
                    expect(reading.border, `${state} border stays engine-neutral`).toBe('0px none ' + reading.color);
                    expect(reading.boxShadow, `${state} box-shadow stays engine-neutral`).toBe('none')
                }

                // Voice is app-owned and asymmetric on purpose: only workstation declares the mono
                // family. Asserting the same font for both would assert a design neither has.
                identity.ownsVoice
                    ? expect(resting.fontFamily, 'workstation speaks mono through the token')
                        .toMatch(/mono/i)
                    : expect(resting.fontFamily, 'FM leaves the engine inherit in place')
                        .not.toMatch(/mono/i)
            })
        }
    }

    test('mutating ONE app token moves that app only — both real consumers, side by side', async ({page}) => {
        await applyTheme(page, 'neo-theme-neo-dark');
        await loadStylesheets(page, [
            APP_IDENTITIES[0].tokens('neo-theme-neo-dark'), APP_IDENTITIES[0].rule,
            APP_IDENTITIES[1].tokens('neo-theme-neo-dark'), APP_IDENTITIES[1].rule
        ]);

        // Two subtrees in ONE document, each wearing a real app root class, so the isolation claim
        // is measured across the two shipped rules rather than across two spec-authored ones.
        await page.evaluate(() => {
            const dashboard = document.querySelector('.neo-dashboard'),
                  sibling   = dashboard.cloneNode(true);

            sibling.id = 'sibling-dashboard';
            dashboard.parentElement.appendChild(sibling);

            dashboard.classList.add('workstation-workspace');
            sibling.classList.add('fm-fleet-cockpit')
        });

        const
            wsTab = '.workstation-workspace .neo-dashboard-dock-rail-tab',
            fmTab = '.fm-fleet-cockpit .neo-dashboard-dock-rail-tab';

        const before = {
            fm: await readTabPaint(page, fmTab),
            ws: await readTabPaint(page, wsTab)
        };

        // Non-vacuity: the two subtrees must be genuinely different consumers, or "only one moved"
        // is unfalsifiable. It is anchored on VOICE rather than ink, because the two apps really do
        // share `#8b97a8` for dim ink in the dark theme — an equal-colour assertion here would have
        // been asserting a difference the design does not have, and it failed exactly that way
        // first. Voice is the axis where they genuinely diverge: only workstation sets the family.
        expect(before.ws.fontFamily, 'precondition: the two subtrees are different consumers')
            .not.toBe(before.fm.fontFamily);

        await page.evaluate(() => {
            const style = document.createElement('style');

            style.textContent =
                '.workstation-workspace .neo-dashboard-dock-edge-rail .neo-button.neo-dashboard-dock-rail-tab ' +
                '{ --dock-rail-tab-color: rgb(255, 0, 0) }';
            document.head.appendChild(style)
        });

        const after = {
            fm: await readTabPaint(page, fmTab),
            ws: await readTabPaint(page, wsTab)
        };

        expect(after.ws.color, 'the mutated token moves the app that sets it').toBe('rgb(255, 0, 0)');
        expect(after.fm, 'and the other real consumer is untouched, on every property').toEqual(before.fm)
    })
});
