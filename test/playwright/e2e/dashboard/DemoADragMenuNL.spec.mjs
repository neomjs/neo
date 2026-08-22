import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the BINDING §06 gesture witness for the Demo-A drop-indicator menu — the
 * real-pointer journey a seam-driven unit cannot certify (and the honest recordable
 * cold-open: this spec's pointer path IS the camera beat).
 *
 * Product truths proven against the running childapp with a real drag:
 * 1. a tab-header pointer drag LIGHTS the menu — the §06 cross + container chips render
 *    while dragging, and the engine's active selection follows the pointer geometrically;
 * 2. hovering a different indicator re-targets the exact post-drop region preview;
 * 3. releasing ON an indicator commits exactly that candidate's semantic operation through
 *    the reducer (App Worker document truth), and the committed re-layout animates
 *    (FLIP transforms observable on marker panes) without replacing surviving panes or the
 *    persistent preview / indicator overlays;
 * 4. Escape mid-drag cancels: the menu clears and the release commits NOTHING;
 * 5. under `prefers-reduced-motion: reduce`, the indicator layer's motion collapses to 0s
 *    THROUGH THE TOKEN on the shared overlay ancestor — the sibling-scope defect class
 *    (tokens on the projected child never reaching overlay siblings) stays dead.
 *
 * Paradigm (whitebox-e2e protocol): Playwright drives the native pointer; the Neural Link
 * fixture reads the workspace document and the indicator component's state at every stage.
 *
 * Run: NEO_E2E_PORT=8091 npx playwright test DemoADragMenuNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

/**
 * Boots the demo, connects the bridge, and resolves the workspace id + zone boxes.
 * @param {Object} page
 * @param {Object} neuralLink
 * @returns {Promise<Object>}
 */
async function bootDemo(page, neuralLink) {
    await page.goto('/examples/dashboard/choreography/index.html');
    page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

    await page.waitForSelector('.agentos-dockdemo-tour-play',          {timeout: 20000});
    await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 20000});

    const app        = await neuralLink.connectToApp('AgentOSDockDemo');
    const workspaces = await app.findInstances({className: 'Neo.examples.dashboard.choreography.DemoAWorkspace'}, ['id']);
    const wsId       = Array.isArray(workspaces) ? workspaces[0]?.id : workspaces?.id;

    expect(wsId, 'the DemoAWorkspace must exist in the App Worker').toBeTruthy();

    // opening stage: two tabs zones — editor (center, leftmost) and preview (right band)
    const zoneBoxes = await page.$$eval('.neo-dashboard-dock-tabs', els =>
        els.map(el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height} })
    );

    expect(zoneBoxes.length).toBeGreaterThanOrEqual(2);

    const [editorZone, previewZone] = [...zoneBoxes].sort((a, b) => a.x - b.x);

    return {app, editorZone, previewZone, wsId}
}

/**
 * Starts a real pointer drag on the Preview tab header and parks the pointer at the target.
 * @param {Object} page
 * @param {Object} target {x, y}
 */
async function dragPreviewHeaderTo(page, target) {
    const header = page.locator('.neo-tab-header-button', {hasText: 'Preview'}).first();

    await expect(header).toBeVisible();

    const box = await header.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Clear the distance threshold, then wait for the App Worker to finish the drag-start
    // handshake. This starts at first paint without a boot settle while respecting the Mouse
    // sensor's intentional 100ms click-vs-drag delay. `neo-is-dragging` is worker-stamped after
    // main-thread configs land, so the target leg cannot outrun drag readiness.
    await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, {steps: 4});
    await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible();
    await page.mouse.move(target.x, target.y, {steps: 15});
    // let the move stream round-trip (main thread → worker → vdom → DOM)
    await page.waitForTimeout(400)
}

test.describe('Demo-A drop-indicator menu: the real-pointer §06 journey (Neural Link)', () => {
    test.setTimeout(120000);

    test('drag lights the menu, indicators re-target the preview, the release commits + animates', async ({page, neuralLink}) => {
        const pageErrors    = [],
              runtimeErrors = [];

        await page.context().exposeFunction('__recordDemoAProjectionRuntimeError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordDemoAProjectionRuntimeError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordDemoAProjectionRuntimeError({
                    reason: String(event.reason?.stack || event.reason?.message || event.reason),
                    type  : 'unhandledrejection'
                })
            })
        });
        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        const {app, editorZone, previewZone, wsId} = await bootDemo(page, neuralLink);

        const editorCenter = {x: editorZone.x + editorZone.width / 2, y: editorZone.y + editorZone.height / 2};

        const identity = await page.evaluate(() => {
            const elements = {
                editorPane    : document.querySelector('.agentos-dockdemo-pane-editor'),
                indicators    : document.querySelector('.neo-dashboard-dock-drop-indicators'),
                previewOverlay: document.querySelector('.neo-dock-preview'),
                previewPane   : document.querySelector('.agentos-dockdemo-pane-preview')
            };

            globalThis.__demoAProjectionIdentity = elements;

            return {
                ids         : Object.fromEntries(Object.entries(elements).map(([key, element]) => [key, element?.id])),
                overlayOrder: [elements.previewOverlay, elements.indicators]
                    .map(element => [...element.parentElement.children].indexOf(element)),
                overlaysShareHost: elements.previewOverlay?.parentElement === elements.indicators?.parentElement
            }
        });

        expect(Object.values(identity.ids).every(Boolean), 'all pane and overlay permanence targets are mounted').toBe(true);
        expect(identity.overlaysShareHost, 'preview and indicator overlays share the persistent dock host').toBe(true);
        expect(identity.overlayOrder[0], 'preview overlay precedes the indicator overlay').toBeLessThan(identity.overlayOrder[1]);

        // FLIP observation armed before the drop lands
        await page.evaluate(() => {
            window.__e2e = {flipSamples: 0};

            const tick = () => {
                document.querySelectorAll('[class*="agentos-dockdemo-pane-"]').forEach(el => {
                    const tf = el.style.transform;
                    tf && tf !== 'none' && window.__e2e.flipSamples++
                });
                window.__e2e.done || requestAnimationFrame(tick)
            };

            requestAnimationFrame(tick)
        });

        // 1. drag the Preview header over the editor zone: the menu MUST light
        await dragPreviewHeaderTo(page, editorCenter);

        await expect(page.locator('.neo-dashboard-dock-drop-indicators:not(.neo-dashboard-dock-drop-indicators-hidden)'),
            'the indicator layer is visible mid-drag').toBeVisible();

        // over the CENTER zone the hovered node IS the chips' root target → cross only (5),
        // by design: duplicate affordances add noise, not options
        const crossOnly = await page.locator('.neo-dashboard-dock-drop-indicator:not(.neo-dashboard-dock-drop-indicator-off), .neo-dashboard-dock-drop-chip:not(.neo-dashboard-dock-drop-indicator-off)').count();

        expect(crossOnly, 'over the root-coincident zone: the 5-position cross, chips omitted').toBe(5);

        // over the NON-root preview zone the full grammar lights: cross + container chips
        await page.mouse.move(previewZone.x + previewZone.width / 2, previewZone.y + previewZone.height / 2, {steps: 8});
        await page.waitForTimeout(300);

        const fullMenu = await page.locator('.neo-dashboard-dock-drop-indicator:not(.neo-dashboard-dock-drop-indicator-off), .neo-dashboard-dock-drop-chip:not(.neo-dashboard-dock-drop-indicator-off)').count();

        expect(fullMenu, 'over a non-root zone: the full §06 menu — 5-position cross + 4 container chips').toBe(9);

        // return to the editor zone for the journey's target steps
        await page.mouse.move(editorCenter.x, editorCenter.y, {steps: 8});
        await page.waitForTimeout(300);

        // engine truth: the pointer sits on the CENTER indicator → the active candidate is the tab-merge
        const indicators   = await app.findInstances({ntype: 'dashboard-dock-drop-indicators'}, ['id']);
        const indicatorsId = Array.isArray(indicators) ? indicators[0]?.id : indicators?.id;

        let active = (await app.getComponent(indicatorsId, ['activeCandidate'])).activeCandidate;

        expect(active?.position).toBe('center');
        expect(active?.preview?.placement?.kind).toBe('tab-into');

        // the tab-into preview fills the whole hovered zone
        let previewBox = await page.$eval('.neo-dock-preview > *', el => ({w: parseFloat(el.style.width), h: parseFloat(el.style.height)}));

        expect(previewBox.w).toBeGreaterThan(editorZone.width - 4);

        // 2. hover the BOTTOM indicator: selection + preview MUST re-target
        await page.mouse.move(editorCenter.x, editorCenter.y + 38, {steps: 6});
        await page.waitForTimeout(300);

        active = (await app.getComponent(indicatorsId, ['activeCandidate'])).activeCandidate;

        expect(active?.position).toBe('bottom');
        expect(active?.preview?.placement?.kind).toBe('edge-bottom'); // center child: no parent split → node split

        previewBox = await page.$eval('.neo-dock-preview > *', el => ({w: parseFloat(el.style.width), h: parseFloat(el.style.height)}));

        expect(previewBox.h, 'the edge-bottom preview is the band, not the zone').toBeLessThan(editorZone.height / 2);

        // 3. release ON the bottom indicator: exactly that candidate commits
        await page.mouse.up();
        await page.waitForTimeout(800); // commit + re-projection + FLIP window

        const doc = (await app.getComponent(wsId, ['dockModel'])).dockModel;

        const split = Object.values(doc.nodes).find(node =>
            node.type === 'split' && node.orientation === 'vertical' && node.children?.[0] === 'editor-tabs'
        );

        expect(split, 'the edge-bottom drop split the editor zone vertically, editor leading').toBeTruthy();

        const previewTabs = doc.nodes[split.children[1]];

        expect(previewTabs.items).toEqual(['preview']);            // the dragged item landed in the new half
        expect(doc.nodes['side-tabs'], 'the emptied source zone dissolved').toBeUndefined();

        // the menu cleared on release, and the committed re-layout ANIMATED
        await expect(page.locator('.neo-dashboard-dock-drop-indicators')).toHaveClass(/neo-dashboard-dock-drop-indicators-hidden/);

        const {flipSamples} = await page.evaluate(() => { window.__e2e.done = true; return window.__e2e });

        expect(flipSamples, 'FLIP transforms were observable on marker panes during the committed re-layout').toBeGreaterThan(0);

        const identityAfter = await page.evaluate(ids => {
            const before = globalThis.__demoAProjectionIdentity,
                  same   = Object.fromEntries(Object.entries(ids).map(([key, id]) => [
                      key,
                      before?.[key] === document.getElementById(id)
                  ])),
                  previewOverlay = before?.previewOverlay,
                  indicators     = before?.indicators;

            return {
                same,
                overlayOrder: [previewOverlay, indicators]
                    .map(element => [...element.parentElement.children].indexOf(element)),
                overlaysShareHost: previewOverlay?.parentElement === indicators?.parentElement
            }
        }, identity.ids);

        expect(identityAfter.same, 'the exact pane and overlay DOM nodes survive the dissolving-source projection')
            .toEqual({editorPane: true, indicators: true, previewOverlay: true, previewPane: true});
        expect(identityAfter.overlaysShareHost, 'persistent overlays remain siblings after projection').toBe(true);
        expect(identityAfter.overlayOrder, 'persistent overlay ordering remains preview then indicators')
            .toEqual(identity.overlayOrder);

        const liveComponents = await Promise.all(Object.values(identity.ids)
            .map(id => app.getComponent(id, ['id'])));

        expect(liveComponents.map(component => component.id), 'every permanence target keeps its App Worker component identity')
            .toEqual(Object.values(identity.ids));
        expect(runtimeErrors, 'no global error or unhandled rejection across the projection').toEqual([]);
        expect(pageErrors, 'no Playwright pageerror across the projection').toEqual([])
    });

    test('Escape mid-drag cancels: the menu clears and the release commits nothing', async ({page, neuralLink}) => {
        const {app, editorZone, wsId} = await bootDemo(page, neuralLink);

        const before = JSON.stringify((await app.getComponent(wsId, ['dockModel'])).dockModel);

        await dragPreviewHeaderTo(page, {x: editorZone.x + editorZone.width / 2, y: editorZone.y + editorZone.height / 2});

        await expect(page.locator('.neo-dashboard-dock-drop-indicators:not(.neo-dashboard-dock-drop-indicators-hidden)')).toBeVisible();

        // Focus has fallen to <body> after the placeholder swap. The main-thread drag owner
        // captures the REAL key and routes `drag:cancel` directly to the active worker zone.
        await page.keyboard.press('Escape');

        // The §06 cancel is complete while the pointer is still down: affordances clear,
        // worker drag state retires, and the proxy is destroyed rather than riding to release.
        await expect(page.locator('.neo-dashboard-dock-drop-indicators')).toHaveClass(/neo-dashboard-dock-drop-indicators-hidden/);
        await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toHaveCount(0);
        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);

        await page.mouse.up();
        await page.waitForTimeout(500);

        const after = JSON.stringify((await app.getComponent(wsId, ['dockModel'])).dockModel);

        expect(after, 'an Escape-cancelled gesture commits NOTHING').toBe(before)
    })
});

test.describe('Demo-A drop-indicator menu: reduced motion (Neural Link)', () => {
    test.setTimeout(120000);

    test('the overlay motion collapses to 0s through the token on the shared ancestor', async ({page, neuralLink}) => {
        // runtime emulation — the fixture environment does not honor test.use contextOptions,
        // so the per-page emulateMedia lever sets the preference instead
        await page.emulateMedia({reducedMotion: 'reduce'});

        const {editorZone} = await bootDemo(page, neuralLink);

        // light the menu with a real drag so the computed style reads the LIVE overlay
        await dragPreviewHeaderTo(page, {x: editorZone.x + editorZone.width / 2, y: editorZone.y + editorZone.height / 2});

        await expect(page.locator('.neo-dashboard-dock-drop-indicators:not(.neo-dashboard-dock-drop-indicators-hidden)')).toBeVisible();

        const motion = await page.evaluate(() => {
            const host      = document.querySelector('.agentos-dockdemo-dock-host'),
                  indicator = document.querySelector('.neo-dashboard-dock-drop-indicator');

            return {
                token           : getComputedStyle(host).getPropertyValue('--dock-transition-duration-fast').trim(),
                baseToken       : getComputedStyle(host).getPropertyValue('--dock-transition-duration').trim(),
                mediaMatches    : matchMedia('(prefers-reduced-motion: reduce)').matches,
                transitionDur   : getComputedStyle(indicator).transitionDuration,
                hostCarriesScope: host.classList.contains('neo-dashboard')
            }
        });

        // the sibling-scope defect class stays dead: the SHARED ancestor carries the scope,
        // the token collapses, and the indicator's transition computes to zero — no local
        // fallback can override it (the transition is token-only by authority)
        expect(motion.mediaMatches, 'the reduce preference is live on the page').toBe(true);
        expect(motion.hostCarriesScope).toBe(true);
        expect(motion.token).toBe('0ms');
        expect(motion.transitionDur.split(',').every(d => d.trim() === '0s')).toBe(true);

        await page.mouse.up()
    })
});
