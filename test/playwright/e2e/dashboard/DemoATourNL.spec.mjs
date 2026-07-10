import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the end-to-end proof for the Demo-A dock-choreography tour — the parent
 * epic's same-PR live-binding guardrail for the showcase surface.
 *
 * The product truths a unit spec cannot certify, proven here against the running childapp:
 * 1. the tour button drives the FULL screenplay through the real reducer seam — 18 beats,
 *    deterministic, completing with the documented finale document in App Worker truth;
 * 2. scene 3's tucks project REAL interactive rail tabs (`Neo.dashboard.DockRail` buttons in
 *    the DOM — the affordance tier, not just document flags);
 * 3. the reveal beat is EXECUTABLE — the scripted cue opens a genuine transient reveal
 *    overlay mid-tour, and the rollback releases it (nothing persisted, nothing left over);
 * 4. the rollback leaves zero rail/overlay residue in the DOM (the destroy-wedge class
 *    stays dead on the composed surface);
 * 5. committed operations animate: FLIP transforms are observable on marker panes mid-tour.
 *
 * Paradigm (whitebox-e2e protocol): Playwright drives the native play-button click; the
 * Neural Link fixture reads the workspace's committed document and counters at every stage.
 *
 * Run: NEO_E2E_PORT=8091 npx playwright test DemoATourNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Demo-A dock-choreography tour journey (Neural Link)', () => {
    test.setTimeout(120000);

    test('the full tour: real rails, executable reveal, clean rollback, animated commits, worker truth', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/childapps/dockdemo/index.html');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        await page.waitForSelector('.agentos-dockdemo-tour-play', {timeout: 20000});

        const app        = await neuralLink.connectToApp('AgentOSDockDemo');
        const workspaces = await app.findInstances({className: 'AgentOS.childapps.dockdemo.view.DemoAWorkspace'}, ['id']);
        const wsId       = Array.isArray(workspaces) ? workspaces[0]?.id : workspaces?.id;

        expect(wsId, 'the DemoAWorkspace must exist in the App Worker').toBeTruthy();

        const readModel = async () => (await app.getComponent(wsId, ['dockModel'])).dockModel;

        // opening truth: the edge-zone stage, preview docked right by construction
        const opening = await readModel();

        expect(opening.nodes.root.zones.center).toBe('editor-tabs');
        expect(opening.nodes['side-tabs'].items).toEqual(['preview']);

        // instrument FLIP observation BEFORE starting: sample marker transforms per frame
        await page.evaluate(() => {
            window.__e2e = {flipSamples: 0, maxRailTabs: 0, revealSeen: false};

            const tick = () => {
                document.querySelectorAll('[class*="agentos-dockdemo-pane-"]').forEach(el => {
                    const tf = el.style.transform;
                    tf && tf !== 'none' && window.__e2e.flipSamples++
                });

                const rails = document.querySelectorAll('.neo-dashboard-dock-rail-tab').length;

                rails > window.__e2e.maxRailTabs && (window.__e2e.maxRailTabs = rails);

                // any-match: the first '[class*="reveal"]' node can be a legitimately HIDDEN
                // overlay instance (display:none → offsetParent null) while a different one
                // is genuinely revealed — a single-match read here passes/fails vacuously
                [...document.querySelectorAll('[class*="dock-reveal-overlay"]')].some(el => el.offsetParent) && (window.__e2e.revealSeen = true);

                window.__e2e.done || requestAnimationFrame(tick)
            };

            requestAnimationFrame(tick)
        });

        // drive the tour with a native click
        await page.click('.agentos-dockdemo-tour-play');

        // completion: all 18 pips light
        await page.waitForFunction(
            () => document.querySelectorAll('.agentos-dockdemo-pip-done').length === 18,
            null,
            {timeout: 30000}
        );

        const observed = await page.evaluate(() => {
            window.__e2e.done = true;
            return window.__e2e
        });

        // (2) scene 3 projected REAL interactive rail tabs — the three tucked residents
        expect(observed.maxRailTabs, 'the tucked window must render real DockRail tab buttons').toBe(3);

        // (3) the scripted reveal cue opened a genuine overlay mid-tour
        expect(observed.revealSeen, 'the reveal beat must be executable, not narration').toBe(true);

        // (5) committed operations animated — FLIP transforms were observable
        expect(observed.flipSamples, 'committed operations must glide (FLIP transforms observed)').toBeGreaterThan(0);

        // (4) clean rollback: zero rail/overlay residue — settlement-based, because the final
        // pip lights on the topology-assert beat while the last commit's re-projection (and
        // its FLIP settle) lands a moment later
        await page.waitForFunction(
            () => document.querySelectorAll('.neo-dashboard-dock-rail-tab').length === 0 &&
                  document.querySelectorAll('[class*="dock-reveal-overlay"]').length === 0,
            null,
            {timeout: 8000}
        );

        // (1) worker truth: the finale document — dense studio, wave rolled back, nothing persisted
        const finale = await readModel();

        expect(finale.nodes['side-tabs'].items).toEqual(['preview', 'terminal', 'logs']);
        expect(finale.nodes.root.zones.center).toBe('editor-tabs');
        expect(finale.items.preview.autoHidden).toBe(false);
        expect(finale.items.terminal.autoHidden).toBe(false);
        expect(finale.items.logs.autoHidden).toBe(false);

        // and the runner's beat counter agrees with the pip strip
        const {beatCount} = await app.getComponent(wsId, ['beatCount']);

        expect(beatCount).toBe(18)
    });
});
