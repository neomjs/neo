import {test, expect} from '@playwright/test';

/**
 * The splitter's affordance, measured on a rendered splitter rather than on stylesheet text.
 *
 * The sibling `dockSplitterLayering.spec.mjs` censuses SCSS source: it proves no application
 * stylesheet paints a splitter and that the engine's identity slots ship empty. That is the
 * ownership question. It cannot answer the one this ticket is actually about — whether a consumer
 * that sets nothing gets a *findable* drag target — because a source guard sees declarations, not
 * resolved values, and the reported defect was a splitter whose declarations all existed and
 * resolved to nothing a user could see.
 *
 * **The controls are the point.** Every arm asserts an exact token-derived value (`36px`, `2px`)
 * rather than "not zero", and pairs each measurement with a probe that must move when the token
 * moves. A stylesheet that failed to load cannot produce 36px by accident, and a value identical
 * before and after an override proves the override never arrived — which is the shape a
 * comfortable green takes here.
 *
 * @see https://github.com/neomjs/neo/issues/17538
 */

const THEMES = ['neo-theme-neo-dark', 'neo-theme-neo-light'];

let dashboardId, splitterId;

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-splitter/index.html');
    await page.waitForSelector('#dock-splitter-test-viewport', {state: 'attached'});

    const ids = await page.evaluate(async () => {
        // The REAL dashboard container, not a plain one wearing `.neo-dashboard`. Neo loads a
        // class's stylesheet when the class is instantiated, so faking the ancestor class leaves
        // `src/dashboard/Container.css` — the file carrying every rule under test — out of the
        // document entirely, and each arm below then measures an unstyled div.
        const dashboard = await Neo.worker.App.createNeoInstance({
            importPath: '../dashboard/Container.mjs',
            // `createNeoInstance` imports the module but resolves the class through the ntype
            // registry — a config without one reaches `parent.add()` with nothing to construct.
            ntype   : 'dashboard',
            parentId: 'dock-splitter-test-viewport'
        });

        if (!dashboard.success) throw new Error(`dashboard: ${dashboard.error.message}`);

        const splitter = await Neo.worker.App.createNeoInstance({
            importPath : '../dashboard/DockSplitter.mjs',
            ntype      : 'dashboard-dock-splitter',
            orientation: 'horizontal',
            parentId   : dashboard.id
        });

        if (!splitter.success) throw new Error(`splitter: ${splitter.error.message}`);

        return {dashboardId: dashboard.id, splitterId: splitter.id}
    });

    ({dashboardId, splitterId} = ids);

    await page.waitForSelector('.neo-dashboard-dock-splitter', {state: 'attached'})
});

test.afterEach(async ({page}) => {
    await page.evaluate(async ids => {
        for (const id of ids) id && await Neo.worker.App.destroyNeoInstance(id)
    }, [splitterId, dashboardId])
});

/** Swap the active theme class on the document element and read back what took effect. */
const applyTheme = (page, theme) => page.evaluate(name => {
    for (const el of [document.body, document.documentElement]) {
        el.classList.forEach(c => c.startsWith('neo-theme-') && el.classList.remove(c))
    }

    document.body.classList.add(name);

    return document.body.className
}, theme);

test.describe('Neo.dashboard.DockSplitter — the rendered affordance floor', () => {
    for (const theme of THEMES) {
        test(`a consumer that sets NO tokens gets a findable splitter — ${theme}`, async ({page}) => {
            await applyTheme(page, theme);

            const measured = await page.evaluate(() => {
                const splitter = document.querySelector('.neo-dashboard-dock-splitter'),
                      band     = getComputedStyle(splitter),
                      handle   = getComputedStyle(splitter, '::after');

                // A plain div in the same document and theme, with no dock class. It fixes what
                // "unpainted" computes to here, so the band's value is read against a real zero
                // rather than an assumption about how this browser serialises transparency.
                const control = document.createElement('div');

                document.body.appendChild(control);

                const result = {
                    bandBackground   : band.backgroundColor,
                    controlBackground: getComputedStyle(control).backgroundColor,
                    handleBackground : handle.backgroundColor,
                    handleContent    : handle.content,
                    handleHeight     : handle.height,
                    handleWidth      : handle.width
                };

                control.remove();

                return result
            });

            // The invisible-splitter defect stated as a measurement: before the promotion the engine
            // declared no paint at all, so this value WAS the control's value.
            expect(measured.bandBackground,
                'the engine floor must paint a band a consumer can see')
                .not.toBe(measured.controlBackground);

            // The handle exists as a real box, at exactly the token defaults. Asserting the exact
            // 36/2 pair rather than "non-zero" is what makes an unloaded stylesheet impossible to
            // mistake for a pass — nothing else in the document produces that pair.
            expect(measured.handleContent, 'the grab handle is rendered').toBe('""');
            expect(measured.handleHeight, 'the long axis is --dock-splitter-handle-size').toBe('36px');
            expect(measured.handleWidth, 'the short axis is --dock-splitter-handle-thickness').toBe('2px');
            expect(measured.handleBackground,
                'and the handle is painted, not merely present').not.toBe('rgba(0, 0, 0, 0)')
        })
    }

    test('the ACTIVE handle colour comes from the engine token an app sets', async ({page}) => {
        await applyTheme(page, 'neo-theme-neo-dark');

        // The rendered half of RA-2. Before this change the engine had `--dock-splitter-handle-color`
        // and `-hover` but no `-active`, so an app wanting a distinct drag colour had nowhere to put
        // it except `&:active::after { background: ... }` in its own stylesheet — precisely the
        // app-layer paint this promotion exists to end. If the engine consumer is missing, the token
        // has no effect and `withToken` below equals `withoutToken`.
        await page.evaluate(() => {
            // The engine rule TRANSITIONS `background`. Reading straight after a state change
            // returns the start value and a frame later returns a blend — both green-looking wrong
            // answers, and a fixed sleep would only make the flake slower.
            const freeze = document.createElement('style');

            freeze.id          = 'freeze-transitions';
            freeze.textContent = '*, *::after, *::before { transition: none !important }';
            document.head.appendChild(freeze)
        });

        const box = await page.locator('.neo-dashboard-dock-splitter').boundingBox();

        const activeHandle = async () => {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();

            const value = await page.evaluate(() => {
                const el = document.querySelector('.neo-dashboard-dock-splitter');

                return {
                    handle  : getComputedStyle(el, '::after').backgroundColor,
                    isActive: el.matches(':active')
                }
            });

            await page.mouse.up();

            return value
        };

        const withoutToken = await activeHandle();

        // Shaped the way a consuming app writes one: the token lands on the SPLITTER's own selector
        // under an app-root class, which is what `Workspace.scss` and `FleetCockpit.scss` both do.
        // Setting it on an ancestor instead would test a mechanism no app uses — and would not even
        // work, because the engine re-declares its token defaults on every `.neo-dashboard`.
        await page.evaluate(() => {
            const style = document.createElement('style');

            style.textContent =
                '.test-app-a .neo-dashboard-dock-splitter { --dock-splitter-handle-color-active: rgb(255, 0, 0) }';
            document.head.appendChild(style);
            document.querySelector('.neo-dashboard').classList.add('test-app-a')
        });

        const withToken = await activeHandle();

        // Precondition: without a live `:active` both reads return the resting value for a reason
        // that has nothing to do with the token, and the comparison below is vacuous.
        expect(withoutToken.isActive, 'precondition: the pointer press must put the splitter in :active').toBe(true);
        expect(withToken.isActive, 'precondition: and again for the second read').toBe(true);

        expect(withToken.handle, 'the app token must reach the active handle').toBe('rgb(255, 0, 0)');
        expect(withoutToken.handle,
            'and the engine floor must differ from it — equal values would mean the token never arrived')
            .not.toBe(withToken.handle)
    });

    /**
     * The two real consuming apps, loaded as the COMPILED stylesheets they ship as.
     *
     * The synthetic-token arm above proves the engine consumes the token. It cannot prove that
     * either app's own rule reaches it, because a rule written in the spec is a rule nobody ships.
     * These link `dist/**\/css/**` — the same artifacts Neo itself loads at runtime — and wear the
     * app's real root class, so what is measured is the shipped cascade.
     */
    const APP_IDENTITIES = [{
        name   : 'workstation',
        rootCls: 'workstation-workspace',
        rule   : '/dist/development/css/src/apps/workstation/Workspace.css',
        // The palette the rule's values REFERENCE, and it is theme-scoped: `--workstation-signal`
        // is declared under `:root .neo-theme-neo-*`, not in the app rule. Without it every
        // `color-mix(… var(--workstation-signal) …)` is an invalid substitution and the band
        // computes to transparent — which is how the first version of this arm failed, and why
        // loading the rule alone would have measured a document the app never ships.
        tokens   : theme => `/dist/development/css/${theme.replace('neo-theme-', 'theme-')}/apps/workstation/Viewport.css`
    }, {
        name   : 'FM',
        rootCls: 'fm-fleet-cockpit',
        rule   : '/dist/development/css/src/apps/agentos/fleet/FleetCockpit.css',
        tokens : theme => `/dist/development/css/${theme.replace('neo-theme-', 'theme-')}/apps/agentos/Viewport.css`
    }];

    /** Resting, hover and active readings of the band and its handle, under one app identity. */
    /** Freezes transitions, links the given stylesheets, and wears the app's root class. */
    const loadStylesheets = async (page, {rootCls, hrefs}) => {
        await page.evaluate(async ({rootCls, hrefs}) => {
            const freeze = document.createElement('style');

            freeze.textContent = '*, *::after, *::before { transition: none !important }';
            document.head.appendChild(freeze);

            for (const href of hrefs) {
                const link = document.createElement('link');

                link.rel  = 'stylesheet';
                link.href = href;

                // A missing artifact must be a loud red here. Silently skipping it would leave the
                // app's tokens undefined and the arm would then measure the ENGINE floor while
                // reporting on the app.
                await new Promise((resolve, reject) => {
                    link.onload  = resolve;
                    link.onerror = () => reject(new Error(`stylesheet did not load: ${href}`));
                    document.head.appendChild(link)
                })
            }

            document.querySelector('.neo-dashboard').classList.add(rootCls)
        }, {rootCls, hrefs})
    };

    const measureStates = async (page, identity) => {
        await loadStylesheets(page, identity);

        const read = () => page.evaluate(() => {
            const el = document.querySelector('.neo-dashboard-dock-splitter');

            return {
                band       : getComputedStyle(el).backgroundColor,
                handle     : getComputedStyle(el, '::after').backgroundColor,
                handleSize : getComputedStyle(el, '::after').height,
                isActive   : el.matches(':active'),
                isHover    : el.matches(':hover'),
                signalToken: resolveColor(getComputedStyle(el).getPropertyValue('--workstation-signal').trim())
            };

            /**
             * The browser's own serialisation of a colour, so a comparison is apples-to-apples.
             *
             * A custom property's value comes back verbatim — `#0f766e` — while `backgroundColor`
             * comes back as `rgb(15, 118, 110)`. String-comparing those two reports a parity
             * FAILURE on identical colours, which is a false red as misleading as a false green.
             */
            function resolveColor(value) {
                if (!value) return '';

                const probe = document.createElement('div');

                probe.style.color = value;
                document.body.appendChild(probe);

                const resolved = getComputedStyle(probe).color;

                probe.remove();

                return resolved
            }
        });

        const box = await page.locator('.neo-dashboard-dock-splitter').boundingBox();

        // Derived from the box, never a fixed corner. The splitter renders at (0, 0) at 6x720, so
        // parking the pointer at the origin leaves it INSIDE the element — the first version of
        // this arm read `resting` while hovering, and only FM's identical hover/active values made
        // that visible. `isHover` is asserted below so the same mistake cannot return silently.
        await page.mouse.move(box.x + box.width + 100, box.y + box.height / 2);

        const resting = await read();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

        const hover = await read();

        await page.mouse.down();

        const active = await read();

        await page.mouse.up();

        return {active, hover, resting}
    };

    for (const identity of APP_IDENTITIES) {
        for (const theme of THEMES) {
            test(`${identity.name} identity reaches all three states through tokens — ${theme}`, async ({page}) => {
                await applyTheme(page, theme);

                const {resting, hover, active} = await measureStates(page, {
                    hrefs  : [identity.tokens(theme), identity.rule],
                    rootCls: identity.rootCls
                });

                // Non-vacuity first, and all three states, because each comparison below is a
                // comparison of one reading with itself if the pointer state was not what the name
                // says. Reading `resting` while hovering is not hypothetical — it happened here.
                expect(resting.isHover, 'precondition: resting must be measured OUTSIDE the element').toBe(false);
                expect(hover.isHover, 'precondition: the pointer must actually be over the splitter').toBe(true);
                expect(active.isActive, 'precondition: the pointer press must put it in :active').toBe(true);

                // The state ladder is live at the boundary both apps agree on. Only workstation
                // declares three DISTINCT band values; FM deliberately gives hover and active the
                // same `--fm-signal 45%`, so asserting a three-step ladder for it would be
                // asserting a design it does not have.
                expect(resting.band, 'the app identity separates resting from hover').not.toBe(hover.band);

                identity.name === 'workstation'
                    // PARITY, on the one value this PR moved. Before the promotion Workspace.scss
                    // painted `&:active::after { background: var(--workstation-signal) }` directly.
                    // The active handle must still compute to exactly that colour — now arriving
                    // through `--dock-splitter-handle-color-active` instead of an app paint rule.
                    ? (
                        expect(active.handle, 'the active handle still resolves to --workstation-signal')
                            .toBe(resting.signalToken),
                        expect(hover.band, 'and workstation does declare a distinct active band')
                            .not.toBe(active.band)
                    )
                    // FM's opt-out, from its real shipped rule rather than a spec-authored one.
                    : expect(active.handleSize, 'FM ships flat — the handle is collapsed by token')
                        .toBe('0px');

                // And the affordance survives either identity: a band a user can see, in every state.
                for (const [state, reading] of Object.entries({resting, hover, active})) {
                    expect(reading.band, `the ${state} band stays visible under ${identity.name}`)
                        .not.toBe('rgba(0, 0, 0, 0)')
                }
            })
        }
    }

    /**
     * The workstation's paint as `Workspace.scss` declared it BEFORE the promotion, verbatim from
     * `git show origin/dev:resources/scss/src/apps/workstation/Workspace.scss`.
     *
     * This is what "values meant to stay unchanged" means concretely. Every entry was a direct
     * declaration on an app-owned rule; each is now a token value the engine consumes. Comparing
     * the rendered result against these EXPRESSIONS — resolved in the same document, so
     * `--workstation-signal` means the same thing on both sides — is a real before/after test,
     * not a restatement of the current stylesheet.
     */
    const PRE_PROMOTION_WORKSTATION = {
        active: {
            band  : 'color-mix(in srgb, var(--workstation-signal) 30%, transparent)',
            handle: 'var(--workstation-signal)',
            ring  : 'inset 0 0 0 1px var(--workstation-signal), 0 0 12px color-mix(in srgb, var(--workstation-signal) 32%, transparent)'
        },
        hover: {
            band  : 'color-mix(in srgb, var(--workstation-signal) 18%, transparent)',
            handle: 'color-mix(in srgb, var(--workstation-signal) 78%, var(--workstation-ink))',
            ring  : 'inset 0 0 0 1px color-mix(in srgb, var(--workstation-signal) 38%, transparent)'
        },
        resting: {
            band  : 'color-mix(in srgb, var(--workstation-signal) 9%, transparent)',
            handle: 'color-mix(in srgb, var(--workstation-signal) 42%, var(--workstation-line))',
            ring  : 'inset 0 0 0 1px color-mix(in srgb, var(--workstation-signal) 18%, transparent)'
        }
    };

    for (const theme of THEMES) {
        test(`workstation paint is UNCHANGED against its pre-promotion declarations — ${theme}`, async ({page}) => {
            await applyTheme(page, theme);
            await loadStylesheets(page, {
                hrefs  : [APP_IDENTITIES[0].tokens(theme), APP_IDENTITIES[0].rule],
                rootCls: APP_IDENTITIES[0].rootCls
            });

            const box = await page.locator('.neo-dashboard-dock-splitter').boundingBox();

            /**
             * Reads the splitter's paint, and — in the SAME document and scope — resolves the
             * pre-promotion expressions through a probe element.
             *
             * Resolving them here rather than hard-coding hex is what makes this a comparison
             * rather than a transcription: the probe evaluates the old expression against the live
             * palette, so a theme whose `--workstation-signal` changed would move BOTH sides and the
             * arm would keep testing the relationship instead of a frozen colour.
             */
            const read = state => page.evaluate(expected => {
                const el    = document.querySelector('.neo-dashboard-dock-splitter'),
                      probe = document.createElement('div');

                // Inside the scoped subtree, or `--workstation-signal` is undefined and every
                // expression collapses to the same invalid value on both sides — which would make
                // the arm pass by matching nothing against nothing.
                el.parentElement.appendChild(probe);

                // camelCase assignment, not `setProperty`, which expects the kebab-case name and
                // silently ignores `backgroundColor` — a no-op there would leave the probe reading
                // its inherited value and the comparison would be against the wrong thing entirely.
                const resolve = (property, value) => {
                    probe.style[property] = value;

                    const resolved = getComputedStyle(probe)[property];

                    probe.style[property] = '';

                    return resolved
                };

                const result = {
                    actual: {
                        band  : getComputedStyle(el).backgroundColor,
                        handle: getComputedStyle(el, '::after').backgroundColor,
                        ring  : getComputedStyle(el).boxShadow
                    },
                    expected: {
                        band  : resolve('backgroundColor', expected.band),
                        handle: resolve('backgroundColor', expected.handle),
                        ring  : resolve('boxShadow', expected.ring)
                    },
                    isActive: el.matches(':active'),
                    isHover : el.matches(':hover')
                };

                probe.remove();

                return result
            }, PRE_PROMOTION_WORKSTATION[state]);

            await page.mouse.move(box.x + box.width + 100, box.y + box.height / 2);

            const resting = await read('resting');

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

            const hover = await read('hover');

            await page.mouse.down();

            const active = await read('active');

            await page.mouse.up();

            expect(resting.isHover, 'precondition: resting is measured outside the element').toBe(false);
            expect(hover.isHover, 'precondition: the pointer is over the splitter').toBe(true);
            expect(active.isActive, 'precondition: the pointer press registers').toBe(true);

            for (const [state, reading] of Object.entries({resting, hover, active})) {
                expect(reading.actual, `${state} paint matches what Workspace.scss used to declare`)
                    .toEqual(reading.expected);

                // Non-vacuity: an unresolvable expression computes to the same empty-ish value on
                // both sides, so equality alone could be two nothings matching.
                expect(reading.expected.band, `${state} expectation actually resolved to a colour`)
                    .toMatch(/^(rgb|color)/)
            }
        })
    }

    test('the flat opt-out collapses the handle and keeps the band', async ({page}) => {
        await applyTheme(page, 'neo-theme-neo-light');

        // `--dock-splitter-handle-size: 0` is a design statement that greps, not an omission. It
        // must remove the HANDLE without removing the affordance: a consumer opting out of the grip
        // still gets a visible band, or the opt-out would silently re-ship the invisible-splitter
        // defect this floor exists to end.
        const measured = await page.evaluate(() => {
            const splitter = document.querySelector('.neo-dashboard-dock-splitter'),
                  read     = () => ({
                      band  : getComputedStyle(splitter).backgroundColor,
                      handle: getComputedStyle(splitter, '::after').height
                  });

            const before = read(),
                  style  = document.createElement('style');

            style.textContent =
                '.test-app-fm .neo-dashboard-dock-splitter { --dock-splitter-handle-size: 0 }';
            document.head.appendChild(style);
            document.querySelector('.neo-dashboard').classList.add('test-app-fm');

            const after = read();

            style.remove();

            return {before, after}
        });

        expect(measured.before.handle, 'precondition: the handle was there to opt out of').toBe('36px');
        expect(measured.after.handle, 'the opt-out collapses the handle').toBe('0px');
        expect(measured.after.band, 'and the band survives it — flat is not invisible')
            .toBe(measured.before.band)
    })
});

/**
 * The NAMED consumer, driven as a page rather than as classes.
 *
 * The suite above mounts `Neo.dashboard.Container` + `DockSplitter` directly, which is the right
 * instrument for token mechanics but leaves one question open: the close target names
 * `examples/dashboard/dock` specifically, because that is the app the invisible-splitter defect was
 * reported against. A witness that assembles its own consumer cannot answer whether THAT page got
 * fixed — it can only show the parts work when someone wires them correctly.
 *
 * The example needs no interaction: its initial dock document commits two splits, so both splitter
 * orientations render on load. And it sets no `themes` in its config, so it boots under the LEGACY
 * `neo-theme-light` — which makes this the strongest available statement of the floor. A consumer
 * that opted into nothing, not even a neo theme, still gets a findable drag target.
 */
test.describe('examples/dashboard/dock — the consumer the defect was reported against', () => {
    test('gets a visible splitter with no app tokens at all', async ({page}) => {
        await page.goto('examples/dashboard/dock/index.html');
        await page.waitForSelector('.neo-dashboard-dock-splitter', {state: 'attached'});

        const measured = await page.evaluate(() => {
            const splitters = [...document.querySelectorAll('.neo-dashboard-dock-splitter')],
                  control   = document.createElement('div');

            document.body.appendChild(control);

            const read = el => ({
                band       : getComputedStyle(el).backgroundColor,
                handleBg   : getComputedStyle(el, '::after').backgroundColor,
                handleShort: getComputedStyle(el, '::after').width,
                handleLong : getComputedStyle(el, '::after').height,
                horizontal : el.classList.contains('neo-dashboard-dock-splitter-horizontal')
            });

            const result = {
                controlBackground: getComputedStyle(control).backgroundColor,
                splitters        : splitters.map(read),
                theme            : document.body.className,
                // The app declares no splitter token anywhere; if it ever did, this arm would be
                // measuring an app override while claiming to measure the engine floor.
                appSetsTokens    : splitters.some(el =>
                    ['--dock-splitter-background', '--dock-splitter-handle-color']
                        .some(name => getComputedStyle(el).getPropertyValue(name).includes('workstation')))
            };

            control.remove();

            return result
        });

        expect(measured.splitters.length, 'the example commits two splits, so both orientations render')
            .toBe(2);
        expect(measured.theme, 'and it boots under the legacy theme it never opted out of')
            .toContain('neo-theme-light');
        expect(measured.appSetsTokens, 'precondition: no app override is in play').toBe(false);

        for (const splitter of measured.splitters) {
            expect(splitter.band, 'the band is painted, not transparent')
                .not.toBe(measured.controlBackground);
            expect(splitter.handleBg, 'and so is the handle').not.toBe('rgba(0, 0, 0, 0)');

            // Exact token-derived geometry, per orientation. "Non-zero" would also pass on a
            // stylesheet that failed to load and left the pseudo-element at its `auto` default —
            // which is exactly what this page rendered before the promotion.
            const [long, short] = splitter.horizontal
                ? [splitter.handleLong, splitter.handleShort]
                : [splitter.handleShort, splitter.handleLong];

            expect(long, 'the handle long axis is --dock-splitter-handle-size').toBe('36px');
            expect(short, 'the short axis is --dock-splitter-handle-thickness').toBe('2px')
        }
    })
});
