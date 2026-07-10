import { test, expect } from '../../fixtures.mjs';

/**
 * Regression suite for wholesale container refreshes (removeAll + add): destroyed children must
 * leave the DOM and the new generation must mount — across structural shapes AND under the
 * in-flight race (a child self-updating in the same burst the parent's refresh destroys it).
 *
 * A destroyed component whose in-flight update entry lingered once wedged its ancestor's yielded
 * refresh forever: no deltas applied, the retired subtree orphaned in the main thread while worker
 * truth stayed correct — and the wedge was invisible to every later diff. The raced variant here
 * pins that class; the structural variants are its clean controls. NO dock code involved: plain
 * containers driven live through the Neural Link.
 *
 * Run: NEO_E2E_PORT=8091 npx playwright test RefreshDomCorpseRepro -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Wholesale container refresh — destroyed child DOM removal', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 } });

    const boot = async ({ page, neuralLink }) => {
        await page.goto('/examples/dashboard/dock/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));
        await page.waitForTimeout(2500);

        const app      = await neuralLink.connectToApp('Neo.examples.dashboard.dock');
        const holders  = await app.findInstances({ className: 'Neo.examples.dashboard.dock.MainContainer' }, ['id']);
        const holderId = Array.isArray(holders) ? holders[0]?.id : holders?.id;

        expect(holderId, 'host page must expose a MainContainer').toBeTruthy();

        return { app, holderId }
    };

    const countMarker = (page, marker) =>
        page.evaluate(text => document.body.innerHTML.split(text).length - 1, marker);

    const runCycle = async ({ app, page, hostId }) => {
        await page.waitForTimeout(800);

        expect(await countMarker(page, 'gen1-alpha'), 'generation-1 DOM must mount').toBeGreaterThan(0);

        await app.callMethod(hostId, 'removeAll', []);
        await app.callMethod(hostId, 'add', [[
            { html: 'gen2-alpha', ntype: 'component' },
            { html: 'gen2-beta',  ntype: 'component' }
        ]]);
        await page.waitForTimeout(1200);

        const gen1 = await countMarker(page, 'gen1-alpha');
        const gen2 = await countMarker(page, 'gen2-alpha');

        console.log(`[corpse-repro] gen1 remnants: ${gen1} | gen2 mounted: ${gen2}`);

        expect(gen2, 'generation-2 DOM must mount after the refresh').toBeGreaterThan(0);
        expect(gen1, 'generation-1 DOM must be GONE after removeAll+add').toBe(0)
    };

    test('variant A — flat: host container with plain component children', async ({ page, neuralLink }) => {
        const { app, holderId } = await boot({ page, neuralLink });

        const created = await app.createInstance({
            className: 'Neo.container.Base',
            parentId : holderId,
            config   : {
                id   : 'corpse-host-flat',
                items: [
                    { html: 'gen1-alpha', ntype: 'component' },
                    { html: 'gen1-beta',  ntype: 'component' }
                ]
            }
        });

        console.log('[corpse-repro] created:', JSON.stringify(created)?.slice(0, 200));

        await runCycle({ app, page, hostId: 'corpse-host-flat' })
    });

    test('variant C — refresh-mounted: generation-1 arrives via a PRIOR wholesale refresh (the dock flow shape)', async ({ page, neuralLink }) => {
        const { app, holderId } = await boot({ page, neuralLink });

        await app.createInstance({
            className: 'Neo.container.Base',
            parentId : holderId,
            config   : {
                id   : 'corpse-host-two-refresh',
                items: [{ html: 'gen0-seed', ntype: 'component' }]
            }
        });
        await page.waitForTimeout(800);

        // Refresh #1 (the tuck analogue): generation-1 mounts via removeAll+add, nested one level.
        await app.callMethod('corpse-host-two-refresh', 'removeAll', []);
        await app.callMethod('corpse-host-two-refresh', 'add', [[
            { ntype: 'container', items: [{ html: 'gen1-alpha', ntype: 'component' }] }
        ]]);
        await page.waitForTimeout(1000);

        expect(await countMarker(page, 'gen1-alpha'), 'refresh #1 must mount generation-1').toBeGreaterThan(0);

        // Refresh #2 (the pin analogue): wholesale replacement again.
        await app.callMethod('corpse-host-two-refresh', 'removeAll', []);
        await app.callMethod('corpse-host-two-refresh', 'add', [[
            { html: 'gen2-alpha', ntype: 'component' }
        ]]);
        await page.waitForTimeout(1200);

        const gen1 = await countMarker(page, 'gen1-alpha');
        const gen2 = await countMarker(page, 'gen2-alpha');

        console.log(`[corpse-repro][C] gen1 remnants: ${gen1} | gen2 mounted: ${gen2}`);

        expect(gen2, 'generation-2 must mount after refresh #2').toBeGreaterThan(0);
        expect(gen1, 'refresh-mounted generation-1 must be GONE after refresh #2').toBe(0)
    });

    test('variant D — stable sibling BEFORE the swapped container (the dock viewport shape)', async ({ page, neuralLink }) => {
        const { app, holderId } = await boot({ page, neuralLink });

        // Shape: [stable toolbar-like sibling, swapped workspace container] — the viewport recipe.
        await app.createInstance({
            className: 'Neo.container.Base',
            parentId : holderId,
            config   : {
                id   : 'corpse-host-stable-prefix',
                items: [
                    { html: 'stable-prefix', ntype: 'component' },
                    { ntype: 'container', items: [{ html: 'gen0-seed', ntype: 'component' }] }
                ]
            }
        });
        await page.waitForTimeout(800);

        // Refresh #1 (tuck analogue): keep the stable sibling, swap the workspace container.
        await app.callMethod('corpse-host-stable-prefix', 'removeAll', []);
        await app.callMethod('corpse-host-stable-prefix', 'add', [[
            { html: 'stable-prefix', ntype: 'component' },
            { ntype: 'container', items: [{ ntype: 'container', items: [{ html: 'gen1-alpha', ntype: 'component' }] }] }
        ]]);
        await page.waitForTimeout(1000);

        expect(await countMarker(page, 'gen1-alpha'), 'refresh #1 must mount generation-1').toBeGreaterThan(0);

        // Refresh #2 (pin analogue): same shape, generation-2 content — gen-1's nested branch must go.
        await app.callMethod('corpse-host-stable-prefix', 'removeAll', []);
        await app.callMethod('corpse-host-stable-prefix', 'add', [[
            { html: 'stable-prefix', ntype: 'component' },
            { ntype: 'container', items: [{ html: 'gen2-alpha', ntype: 'component' }] }
        ]]);
        await page.waitForTimeout(1200);

        const gen1 = await countMarker(page, 'gen1-alpha');
        const gen2 = await countMarker(page, 'gen2-alpha');

        console.log(`[corpse-repro][D] gen1 remnants: ${gen1} | gen2 mounted: ${gen2}`);

        expect(gen2, 'generation-2 must mount after refresh #2').toBeGreaterThan(0);
        expect(gen1, 'generation-1 must be GONE after refresh #2 (stable-prefix shape)').toBe(0)
    });

    test('regression — same-burst child self-update + wholesale refresh applies deltas correctly', async ({ page, neuralLink }) => {
        const { app, holderId } = await boot({ page, neuralLink });

        await app.createInstance({
            className: 'Neo.container.Base',
            parentId : holderId,
            config   : {
                id   : 'corpse-host-self-update',
                items: [
                    { html: 'stable-prefix', ntype: 'component' },
                    { ntype: 'container', items: [{ html: 'gen0-seed', ntype: 'component' }] }
                ]
            }
        });
        await page.waitForTimeout(800);

        // Refresh #1 mounts generation-1 with an addressable nested grandchild.
        await app.callMethod('corpse-host-self-update', 'removeAll', []);
        await app.callMethod('corpse-host-self-update', 'add', [[
            { html: 'stable-prefix', ntype: 'component' },
            { ntype: 'container', items: [
                { ntype: 'container', items: [{ html: 'gen1-alpha', id: 'gen1-touchable', ntype: 'component' }] }
            ]}
        ]]);
        await page.waitForTimeout(1000);

        expect(await countMarker(page, 'gen1-alpha'), 'refresh #1 must mount generation-1').toBeGreaterThan(0);

        // The rail biography, RACED: the grandchild's self-update is immediately followed by the
        // destroying refresh in the same burst — NO settle wait (the settled version stays clean;
        // same-burst interleaving is the load-bearing condition per the dock-flow bisection).
        await app.setProperties('gen1-touchable', { html: 'gen1-alpha-touched' });

        // Refresh #2 races the in-flight child update: the branch must still be removed.
        await app.callMethod('corpse-host-self-update', 'removeAll', []);
        await app.callMethod('corpse-host-self-update', 'add', [[
            { html: 'stable-prefix', ntype: 'component' },
            { ntype: 'container', items: [{ html: 'gen2-alpha', ntype: 'component' }] }
        ]]);
        await page.waitForTimeout(1200);

        const gen1touched = await countMarker(page, 'gen1-alpha-touched');
        const gen2        = await countMarker(page, 'gen2-alpha');

        console.log(`[corpse-repro][E] gen1-touched remnants: ${gen1touched} | gen2 mounted: ${gen2}`);

        expect(gen2, 'generation-2 must mount after refresh #2').toBeGreaterThan(0);
        expect(gen1touched, 'the SELF-UPDATED generation-1 branch must be GONE after refresh #2').toBe(0)
    });

    test('variant B — nested: generation-1 children live inside an intermediate container', async ({ page, neuralLink }) => {
        const { app, holderId } = await boot({ page, neuralLink });

        await app.createInstance({
            className: 'Neo.container.Base',
            parentId : holderId,
            config   : {
                id   : 'corpse-host-nested',
                items: [{
                    ntype: 'container',
                    items: [
                        { html: 'gen1-alpha', ntype: 'component' },
                        { html: 'gen1-beta',  ntype: 'component' }
                    ]
                }]
            }
        });

        await runCycle({ app, page, hostId: 'corpse-host-nested' })
    });
});
