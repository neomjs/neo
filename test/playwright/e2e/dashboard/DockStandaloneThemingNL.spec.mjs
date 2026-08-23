import { test, expect } from '../../fixtures.mjs';
import fs               from 'fs';
import path             from 'path';
import {fileURLToPath}  from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The standalone-dock invariant, demonstrated (ticket-ref-ok: the spec pins the ticket's
 * standalone-proof AC and its mutation control).
 *
 * A dashboard dropped into a host with ZERO application dock CSS must render fully themed in
 * both primary themes. The host is `examples/dashboard/dock` — it carries no app stylesheet at
 * all (verified by the absent-stylesheet precondition below), so every dock token resolves from
 * the engine layers alone: the structure layer's paint reading the THEME values layer
 * (theme-neo-dark + theme-neo-light `dashboard/` sheets).
 *
 * The proof has two levels and a mutation half:
 *   1. TOKEN level — the theme host resolves the values-layer tokens (`--agent-dock-preview-accept`,
 *      `--dock-preview-ground`) to the layer's values, per theme.
 *   2. PAINT level — a specimen carrying the REAL indicator classes (the same elements a live
 *      drag renders, without a drag's nondeterminism) resolves the accept accent through the
 *      `::before` chevron's `border-color`, which reads `var(--agent-dock-preview-accept, …)` with
 *      no transition — transition-free by construction, so the assertion is timing-safe.
 *   3. MUTATION control — with the values layer's stylesheet requests aborted, the same specimen
 *      falls back to the structure layer's literal (#4493f8). A proof that stays green with the
 *      layer deleted would be observing nothing.
 *
 * Theme selection rides a routed `neo-config.json` (the MicroLoader imports it as a JSON module):
 * each run pins `themes` to exactly one neo theme, so the theme-host class and the lazy-loaded
 * values sheets are deterministic.
 *
 * Run: npx playwright test DockStandaloneThemingNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Dock standalone theming — the values layer (Neural Link)', () => {
    test.setTimeout(90000);

    const EXAMPLE_CONFIG = path.resolve(__dirname, '../../../../examples/dashboard/dock/neo-config.json'),

          // [token level] values-layer token → expected resolved value per theme.
          // [paint level] the indicator chevron's resolved border-color per theme.
          EXPECTATIONS = {
              'neo-theme-neo-dark': {
                  acceptToken: '#5eead4',
                  groundToken: 'rgba(26, 33, 44, 0.92)',
                  acceptPaint: 'rgb(94, 234, 212)'
              },
              'neo-theme-neo-light': {
                  acceptToken: '#0d9488',
                  groundToken: 'rgba(247, 249, 252, 0.94)',
                  acceptPaint: 'rgb(13, 148, 136)'
              }
          },

          // The structure layer's literal fallback for --agent-dock-preview-accept (#4493f8).
          FALLBACK_PAINT = 'rgb(68, 147, 248)';

    /**
     * Boots the dock example with its `themes` config pinned to one neo theme.
     * @param {Object} page
     * @param {String} theme
     * @param {Boolean} blockValuesLayer mutation control: abort the values-layer stylesheet requests
     */
    async function boot(page, theme, {blockValuesLayer = false} = {}) {
        const config = {...JSON.parse(fs.readFileSync(EXAMPLE_CONFIG, 'utf8')), themes: [theme]};

        await page.route('**/examples/dashboard/dock/neo-config.json*', route =>
            route.fulfill({contentType: 'application/json', body: JSON.stringify(config)})
        );

        if (blockValuesLayer) {
            // Fulfill with an EMPTY sheet (200, no rules) rather than aborting: the loader awaits
            // each sheet's load event, and an aborted request never fires it — a hang would model
            // nothing. The empty sheet is the faithful mutation: the layer loads and defines nothing.
            await page.route('**/css/theme-neo-*/dashboard/**', route =>
                route.fulfill({contentType: 'text/css', body: '/* mutation: the values layer defines nothing */'})
            );
        }

        await page.goto('/examples/dashboard/dock/');
        await page.waitForSelector('.neo-dashboard', {timeout: 30000});
        await page.evaluate(() => document.fonts.ready);
    }

    /**
     * Mounts the deterministic indicator specimen inside the dashboard host and returns its id.
     * @param {Object} page
     */
    async function mountSpecimen(page) {
        return page.evaluate(() => {
            document.getElementById('standalone-specimen')?.remove();

            const host = document.querySelector('.neo-dashboard'),
                  el   = document.createElement('div');

            el.id        = 'standalone-specimen';
            el.className = 'neo-dashboard-dock-drop-indicator neo-dashboard-dock-drop-indicator-top';
            host.appendChild(el);

            return el.id;
        });
    }

    for (const [theme, expected] of Object.entries(EXPECTATIONS)) {
        test(`standalone host is fully themed under ${theme} — token and paint level`, async ({page, neuralLink}) => {
            await boot(page, theme);

            // Whitebox engine truth: the dock holder is live in the App Worker with a committed
            // dock model — the engine surface this host renders (same anchor DockDragDropNL uses).
            const app      = await neuralLink.connectToApp('Neo.examples.dashboard.dock'),
                  holders  = await app.findInstances({className: 'Neo.examples.dashboard.dock.MainContainer'}, ['id']),
                  holderId = Array.isArray(holders) ? holders[0]?.id : holders?.id;
            expect(holderId, 'the dock MainContainer must exist in the App Worker').toBeTruthy();

            const dockModel = (await app.getComponent(holderId, ['dockModel']))?.dockModel;
            expect(dockModel, 'the holder carries a committed dock model').toBeTruthy();

            // Precondition: the host carries NO application stylesheet — every dock token resolves
            // from engine layers alone. This is the "zero app-local dock CSS" half of the invariant.
            const appSheets = await page.evaluate(() =>
                [...document.styleSheets].map(sheet => sheet.href || '').filter(href => href.includes('/apps/'))
            );
            expect(appSheets, 'the example host must not load any app-layer stylesheet').toEqual([]);

            // The theme class rides <body> in this host.
            expect(await page.evaluate(t => document.body.classList.contains(t), theme)).toBe(true);

            // TOKEN level: the values layer drives the theme host.
            const tokens = await page.evaluate(() => {
                const style = getComputedStyle(document.body);

                return {
                    accept: style.getPropertyValue('--agent-dock-preview-accept').trim(),
                    ground: style.getPropertyValue('--dock-preview-ground').trim()
                };
            });
            expect(tokens.accept, `--agent-dock-preview-accept under ${theme}`).toBe(expected.acceptToken);
            expect(tokens.ground, `--dock-preview-ground under ${theme}`).toBe(expected.groundToken);

            // PAINT level: the structure layer's var() chain resolves the token into real paint.
            await mountSpecimen(page);
            const chevronColor = await page.evaluate(() => {
                const el = document.getElementById('standalone-specimen');
                return getComputedStyle(el, '::before').borderColor;
            });
            expect(chevronColor, `indicator chevron resolves the themed accept accent under ${theme}`).toBe(expected.acceptPaint);
        });
    }

    test('MUTATION control: with the values layer blocked, the specimen renders the engine literal fallback', async ({page}) => {
        await boot(page, 'neo-theme-neo-dark', {blockValuesLayer: true});

        // The blocked layer must be observable at token level too.
        const accept = await page.evaluate(() =>
            getComputedStyle(document.body).getPropertyValue('--agent-dock-preview-accept').trim()
        );
        expect(accept, 'the values-layer token must be ABSENT when its stylesheet is blocked').toBe('');

        await mountSpecimen(page);
        const chevronColor = await page.evaluate(() => {
            const el = document.getElementById('standalone-specimen');
            return getComputedStyle(el, '::before').borderColor;
        });
        expect(chevronColor, 'the chevron falls back to the structure literal (#4493f8)').toBe(FALLBACK_PAINT);
    });
});

/**
 * The relocated-example palette boundary (ticket-ref-ok: #17573): Demo A and Demo B must
 * render from an example-owned theme file, never from the Fleet Manager's Viewport sheet.
 *
 * The positive matrix observes both the worker-owned workspace instance and browser paint under
 * both primary themes. The mutation cell replaces only the new palette sheet with an empty 200
 * response; the token and its resulting paint must disappear, proving the positive assertions
 * would fail if the example-owned layer were removed.
 */
test.describe('Relocated dock examples — example-owned palette (Neural Link)', () => {
    test.setTimeout(90000);

    const EXAMPLES = [{
              appName      : 'Neo.examples.dashboard.choreography',
              className    : 'Neo.examples.dashboard.choreography.DemoAWorkspace',
              configPath   : path.resolve(__dirname, '../../../../examples/dashboard/choreography/neo-config.json'),
              configRoute  : '**/examples/dashboard/choreography/neo-config.json*',
              paintSelector: '.agentos-dockdemo-pane',
              slug         : 'choreography',
              url          : '/examples/dashboard/choreography/'
          }, {
              appName      : 'Neo.examples.dashboard.crossWindow',
              className    : 'Neo.examples.dashboard.crossWindow.DemoBWorkspace',
              configPath   : path.resolve(__dirname, '../../../../examples/dashboard/crossWindow/neo-config.json'),
              configRoute  : '**/examples/dashboard/crossWindow/neo-config.json*',
              paintSelector: '.agentos-dockdemo-pane',
              slug         : 'cross-window',
              url          : '/examples/dashboard/crossWindow/'
          }],
          EXPECTATIONS = {
              'neo-theme-neo-dark': {
                  background: 'rgb(11, 14, 19)',
                  ground    : '#0b0e13',
                  panel     : '#141a23',
                  panelPaint: 'rgb(20, 26, 35)',
                  signal    : '#5eead4'
              },
              'neo-theme-neo-light': {
                  background: 'rgb(242, 245, 249)',
                  ground    : '#f2f5f9',
                  panel     : '#ffffff',
                  panelPaint: 'rgb(255, 255, 255)',
                  signal    : '#0f766e'
              }
          },
          PALETTE_REQUEST = '**/css/theme-neo-*/examples/dashboard/Palette.css*';

    /**
     * Boots one relocated example under one pinned theme and binds NL to its exact worker.
     * @param {Object} page
     * @param {Object} neuralLink
     * @param {Object} example
     * @param {String} theme
     * @param {Object} [options]
     * @param {Boolean} [options.blockPalette=false]
     * @returns {Promise<{app: Object, workspaceId: String}>}
     */
    async function bootRelocatedExample(page, neuralLink, example, theme, {blockPalette = false} = {}) {
        const config = {...JSON.parse(fs.readFileSync(example.configPath, 'utf8')), themes: [theme]};

        await page.route(example.configRoute, route =>
            route.fulfill({contentType: 'application/json', body: JSON.stringify(config)})
        );

        if (blockPalette) {
            await page.route(PALETTE_REQUEST, route =>
                route.fulfill({contentType: 'text/css', body: '/* mutation: example palette defines nothing */'})
            )
        }

        await page.goto(example.url);
        await page.waitForSelector('.agentos-dockdemo-workspace', {timeout: 30000});
        await page.evaluate(() => document.fonts.ready);

        const app         = await neuralLink.connectToApp(example.appName),
              found       = await app.findInstances({className: example.className}, ['id']),
              workspaceId = Array.isArray(found) ? found[0]?.id : found?.id;

        expect(workspaceId, `${example.slug} workspace must exist in the App Worker`).toBeTruthy();

        return {app, workspaceId}
    }

    for (const example of EXAMPLES) {
        for (const [theme, expected] of Object.entries(EXPECTATIONS)) {
            test(`${example.slug} owns its ${theme} palette — worker token + browser paint`, async ({page, neuralLink}) => {
                const {app, workspaceId} = await bootRelocatedExample(page, neuralLink, example, theme);

                const sheetUrls = await page.evaluate(() =>
                    [...document.styleSheets].map(sheet => sheet.href || '')
                );

                expect(
                    sheetUrls.filter(url => url.includes('/apps/agentos/')),
                    'a standalone example must load zero AgentOS product stylesheets'
                ).toEqual([]);
                expect(
                    sheetUrls.some(url => url.includes('/examples/dashboard/Palette.css')),
                    'the example-owned palette stylesheet is present'
                ).toBe(true);

                const workerStyles = await app.getComputedStyles(workspaceId, [
                    '--dashboard-example-ground',
                    '--dashboard-example-panel',
                    '--dashboard-example-signal',
                    'background-color'
                ]);
                expect(workerStyles['--dashboard-example-ground']).toBe(expected.ground);
                expect(workerStyles['--dashboard-example-panel']).toBe(expected.panel);
                expect(workerStyles['--dashboard-example-signal']).toBe(expected.signal);
                expect(workerStyles['background-color']).toBe(expected.background);

                const browserPaint = await page.locator(example.paintSelector).first().evaluate(node => {
                    const style = getComputedStyle(node);
                    return {
                        background: style.backgroundColor,
                        panel     : style.getPropertyValue('--dashboard-example-panel').trim()
                    }
                });
                expect(browserPaint.panel).toBe(expected.panel);
                expect(browserPaint.background).toBe(expected.panelPaint)
            })
        }
    }

    test('MUTATION control: removing the example palette removes its token and ground paint', async ({page, neuralLink}) => {
        const example            = EXAMPLES[0],
              {app, workspaceId} = await bootRelocatedExample(
                  page,
                  neuralLink,
                  example,
                  'neo-theme-neo-dark',
                  {blockPalette: true}
              ),
              workerStyles      = await app.getComputedStyles(workspaceId, [
                  '--dashboard-example-ground',
                  'background-color'
              ]);

        expect(workerStyles['--dashboard-example-ground'] || '', 'the blocked palette token is absent').toBe('');
        expect(
            workerStyles['background-color'],
            'the workspace cannot keep the positive dark ground when the palette is empty'
        ).not.toBe(EXPECTATIONS['neo-theme-neo-dark'].background)
    })
});
