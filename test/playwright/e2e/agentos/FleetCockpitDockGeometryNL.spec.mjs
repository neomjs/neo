import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the dock GEOMETRY convergence witness for the cockpit — the reserved
 * acceptance shape from the split-brain investigation: after every committed operation, the
 * RENDERED tree must converge to the worker-committed document within a bounded window.
 * Semantic-vs-physical agreement, same discipline as the tour reveal detector.
 *
 * The defect class this pins (empirically convicted on this surface): flexbox's default
 * `min-height: auto` let a zone's min-content floor cap the split distribution — the
 * committed document said one ratio, the paint held another, FOREVER, with a fully healthy
 * vdom pipeline (correct elements, correct inline flex, no in-flight residue). The adapter
 * now releases the floor on every projected split child; this witness fails loudly should
 * any surface reintroduce a hidden geometry authority beside the document.
 *
 * Deterministic by design: commits ride the NL write-half (`executeDockOperation`) — the
 * geometry contract is commit-path-independent; pointer-gesture coverage is the drag lane's
 * concern, not this witness's.
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test FleetCockpitDockGeometryNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet cockpit — dock geometry convergence (Neural Link)', () => {
    test.setTimeout(90000);

    test('the rendered split converges to every committed ratio within a bounded window', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

        const splitter = page.locator('.fm-fleet-cockpit .neo-dashboard-dock-splitter').first();
        await expect(splitter).toBeVisible({timeout: 30000});

        const app      = await neuralLink.connectToApp('AgentOS'),
              cockpits = await app.findInstances({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']),
              holderId = Array.isArray(cockpits) ? cockpits[0]?.id : cockpits?.id;

        expect(holderId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        // the physical truth: the splitter's position within ITS split container — the
        // number the committed sizes[0] must converge to (transform-inclusive on purpose:
        // a stuck motion layer must fail this witness too)
        const renderedRatio = () => page.evaluate(() => {
            const splitterEl = document.querySelector('.fm-fleet-cockpit .neo-dashboard-dock-splitter'),
                  parent     = splitterEl?.parentElement,
                  sr         = splitterEl?.getBoundingClientRect(),
                  pr         = parent?.getBoundingClientRect();

            return sr && pr ? (sr.top - pr.top) / pr.height : null
        });

        const committedSizes = async () => {
            const topo = await app.getDockTopology(holderId),
                  doc  = topo?.document ?? topo;
            return doc.nodes['primary-split'].sizes
        };

        // state-relative targets (the SharedWorker heap is shared across a sweep): two
        // commits in opposite directions, each PAST the ~0.42 min-content floor the
        // convicted defect froze at — a floor regression cannot pass both
        const sizes0  = await committedSizes(),
              targets = sizes0[0] < 0.5 ? [[0.7, 0.3], [0.35, 0.65]] : [[0.3, 0.7], [0.75, 0.25]];

        for (const target of targets) {
            const result = await app.executeDockOperation(holderId, {
                operation: 'resizeSplit', splitNodeId: 'primary-split', sizes: target
            });

            expect(result.applied, `resizeSplit ${JSON.stringify(target)} must commit`).toBe(true);

            // worker truth first (the merged journey's own discipline)...
            await expect.poll(committedSizes, {timeout: 10000, intervals: [100]}).toEqual(target);

            // ...then the BOUNDED-CONVERGENCE witness: paint follows the document. The
            // splitter's own extent makes the rendered ratio sit within ~1.5% of the
            // committed share; 0.03 absorbs that plus sub-pixel rounding, while any
            // min-content floor deviation is an order of magnitude larger.
            await expect.poll(renderedRatio, {
                message  : `the RENDERED split must converge to committed ${target[0]} (no hidden geometry authority)`,
                timeout  : 4000,
                intervals: [100]
            }).toBeCloseTo(target[0], 1.5);

            const rendered = await renderedRatio();
            expect(Math.abs(rendered - target[0]), `rendered ${rendered} vs committed ${target[0]}`).toBeLessThan(0.03)
        }
    });
});
