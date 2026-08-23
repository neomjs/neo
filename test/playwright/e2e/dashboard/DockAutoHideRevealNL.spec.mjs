import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the end-to-end gesture proof for the auto-hide interaction contract — a committed
 * auto-hidden item collapses to a real edge-rail BUTTON, a native CLICK on that button opens a
 * transient reveal overlay WITHOUT touching worker truth, and the overlay's PIN button commits
 * `setItemPinned(true)` through the reducer.
 *
 * This is the epic's gesture-proof guardrail ridden in the same PR as the affordance: the product
 * truths a unit spec cannot certify are (1) the rail projects real, clickable buttons in the DOM,
 * (2) the reveal is genuinely runtime-only — the committed dockZone.v1 document in the App Worker
 * is byte-stable across reveal open/close, (3) the pin gesture mutates worker truth exactly once,
 * through the semantic operation path, and the affordance instances retire from the worker.
 *
 * Paradigm (whitebox-e2e protocol): Playwright drives native mouse gestures; the Neural Link
 * fixture reads the holder's committed document (dockModel) at every stage and performs the ONE
 * programmatic setup commit (auto-hiding the inspector) through the example's own reducer seam.
 *
 * Run: NEO_E2E_PORT=8091 npx playwright test DockAutoHideRevealNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 * (the port override isolates from any foreign dev-server squatting on 8080)
 */

const bootDockExample = async ({ page, neuralLink }) => {
    await page.goto('/examples/dashboard/dock/');
    page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

    await page.waitForTimeout(2500); // settle worker boot + first render

    const app      = await neuralLink.connectToApp('Neo.examples.dashboard.dock');
    const holders  = await app.findInstances({ className: 'Neo.examples.dashboard.dock.MainContainer' }, ['id']);
    const holderId = Array.isArray(holders) ? holders[0]?.id : holders?.id;

    expect(holderId, 'the dock MainContainer must exist in the App Worker').toBeTruthy();

    const readModel = async () => (await app.getComponent(holderId, ['dockModel'])).dockModel;

    return { app, holderId, readModel }
};

const tuckInspector = async ({ app, holderId, page }) => {
    const commitResult = await app.callMethod(holderId, 'applyDockZoneOperation', [
        { autoHidden: true, itemId: 'inspector', operation: 'setItemAutoHidden' }
    ]);
    expect(commitResult?.errors, 'the auto-hide commit must pass the model guards').toEqual([]);
    await app.callMethod(holderId, 'onDockZoneDocumentChange', [commitResult.document]);
    await page.waitForTimeout(1000)
};

/**
 * @summary Builds one real projected rail on every edge, with two auto-hidden items apiece. The
 * center item keeps the edge-zone document renderable while every edge band exercises the same
 * adapter path production workspaces use.
 * @returns {Object}
 */
const createFourEdgeRailDocument = () => {
    const
        items = {
            center: {componentRef: 'Center', title: 'Center', kind: 'panel'}
        },
        nodes = {
            root         : {type: 'edge-zone', zones: {center: 'center-tabs'}},
            'center-tabs': {type: 'tabs', items: ['center'], activeItemId: 'center'}
        };

    for (const edge of ['top', 'right', 'bottom', 'left']) {
        const itemIds = [`${edge}-one`, `${edge}-two`];

        itemIds.forEach((itemId, index) => {
            items[itemId] = {
                autoHidden  : true,
                componentRef: `${edge}-${index + 1}`,
                kind        : 'panel',
                pinnable    : true,
                pinned      : false,
                title       : `${edge[0].toUpperCase()}${edge.slice(1)} perspectives ${index + 1}`
            }
        });

        nodes[`${edge}-tabs`] = {type: 'tabs', items: itemIds, activeItemId: itemIds[0]};
        nodes.root.zones[edge] = `${edge}-tabs`
    }

    return {schema: 'neo.harness.dockZone.v1', root: 'root', items, nodes}
};

test.describe('Dock auto-hide reveal/pin journey (Neural Link)', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 } });

    test('rail click reveals without persisting; the pin gesture commits setItemPinned through the reducer', async ({ page, neuralLink }) => {
        const { app, holderId, readModel } = await bootDockExample({ page, neuralLink });

        // Setup truth: inspector sits visible in the right edge band; nothing rails yet.
        const before = await readModel();
        expect(before?.nodes?.['inspector-tabs']?.items, 'the example must seed the inspector in the right edge band').toEqual(['inspector']);
        expect(before?.items?.inspector?.autoHidden, 'the inspector must start visible').not.toBe(true);
        await expect(page.locator('.neo-dashboard-dock-edge-rail .neo-dashboard-dock-rail-tab')).toHaveCount(0);

        await tuckInspector({ app, holderId, page });

        // Product truth #1: the committed auto-hidden item projects as a REAL rail button.
        const railTab = page.locator('.neo-dashboard-dock-rail-tab', { hasText: 'Inspector' }).first();
        await expect(railTab, 'the inspector must collapse to a labeled edge-rail tab').toBeVisible({ timeout: 10000 });

        const hidden = await readModel();
        expect(hidden?.items?.inspector?.autoHidden, 'worker truth must carry autoHidden: true').toBe(true);

        await page.evaluate(() => {
            window.__neoDockRevealAnimationStarts = 0;

            document.addEventListener('animationstart', event => {
                if (event.animationName.startsWith('neo-dock-reveal-')) {
                    window.__neoDockRevealAnimationStarts++
                }
            })
        });

        // Native gesture: CLICK the rail tab -> transient reveal overlay.
        await railTab.click();
        await page.waitForTimeout(600);

        // Keep the locator bound to the stable overlay node. A selector that excludes the hidden
        // class disappears from the result set as soon as worker truth adds that class, which can
        // make `toBeHidden()` pass even when a later equal-specificity layout rule keeps the real
        // element painted as `display:flex`.
        const overlay = page.locator('.neo-dashboard-dock-reveal-overlay').first();
        await expect(overlay, 'the reveal overlay must open on rail-tab click').toBeVisible({ timeout: 10000 });
        await expect(overlay.locator('.neo-dashboard-dock-reveal-title'), 'the overlay must title the revealed item').toHaveText('Inspector');
        await expect.poll(() => page.evaluate(() => window.__neoDockRevealAnimationStarts), {
            message: 'the token-scoped reveal animation must start on the first reveal'
        }).toBeGreaterThan(0);

        const firstRevealAnimationStarts = await page.evaluate(() => window.__neoDockRevealAnimationStarts);

        // Product truth #2: reveal is runtime-only — worker truth is byte-stable across the reveal.
        const revealed = await readModel();
        expect(JSON.stringify(revealed), 'the committed document must NOT change on reveal').toBe(JSON.stringify(hidden));

        // Embodied focus: real browser focus moved INSIDE the overlay on click-reveal.
        expect(await page.evaluate(() =>
            document.activeElement?.closest('.neo-dashboard-dock-reveal-overlay') !== null
        ), 'click-reveal must move real focus into the overlay').toBe(true);

        // Escape dismisses — runtime-only, document byte-stable.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        await expect(overlay, 'Escape must dismiss the reveal').toBeHidden();
        expect(JSON.stringify(await readModel()), 'Escape dismissal must not touch the document').toBe(JSON.stringify(hidden));

        // Outside-click dismissal (focused reveal): clicking outside moves focus out -> focus-leave dismisses.
        await railTab.click();
        await page.waitForTimeout(400);
        await expect(overlay).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.__neoDockRevealAnimationStarts), {
            message: 'the token-scoped reveal animation must restart on re-reveal'
        }).toBeGreaterThan(firstRevealAnimationStarts);
        await page.locator('.neo-tab-header-button', { hasText: 'Strategy' }).first().click();
        await page.waitForTimeout(400);
        await expect(overlay, 'an outside click must dismiss the focused reveal').toBeHidden();
        expect(JSON.stringify(await readModel()), 'outside-click dismissal must not touch the document').toBe(JSON.stringify(hidden));

        // Hover mode (workspace opt-in, live-configured): dwell opens; leaving the tab without
        // ever entering the overlay dismisses through the grace window.
        const railInstances = await app.findInstances({ ntype: 'dashboard-dock-rail' }, ['id']);
        const railId        = Array.isArray(railInstances) ? railInstances[0]?.id : railInstances?.id;
        await app.setProperties(railId, { autoHideRevealOnHover: true, revealDismissGraceMs: 400, revealDwellMs: 100 });

        // Target Playwright's visible actionability point. At a clipped viewport edge, the raw DOM
        // center can sit outside the viewport even though the rendered rail affordance is visible.
        await railTab.hover();
        await page.waitForTimeout(350); // > dwell
        await expect(overlay, 'opt-in hover must reveal after the dwell').toBeVisible();

        await page.mouse.move(100, 100); // jump far outside — never crosses the overlay
        await page.waitForTimeout(150);  // < grace: still shown
        await expect(overlay, 'the grace window must hold the overlay briefly').toBeVisible();
        await page.waitForTimeout(600);  // > grace
        await expect(overlay, 'hover-away without entering the overlay must dismiss through grace').toBeHidden();

        await app.setProperties(railId, { autoHideRevealOnHover: false });

        // Re-open for the pin tail.
        await railTab.click();
        await page.waitForTimeout(600);
        await expect(overlay).toBeVisible();

        // Native gesture: PIN -> the one committed operation of the interaction.
        await overlay.locator('.neo-dashboard-dock-reveal-pin').first().click();
        await page.waitForTimeout(1500);

        // Product truth #3: the pin gesture mutated worker truth through the semantic path.
        const pinned = await readModel();
        console.log('[auto-hide] inspector:', JSON.stringify(hidden?.items?.inspector), '->', JSON.stringify(pinned?.items?.inspector));
        expect(pinned?.items?.inspector?.pinned,     'the pin gesture must commit setItemPinned(true)').toBe(true);
        expect(pinned?.items?.inspector?.autoHidden, 'the model must clear autoHidden on pin (landed guard)').toBe(false);

        // ...and the affordance retires from WORKER truth: the re-projected tree rails nothing.
        expect(await app.findInstances({ ntype: 'dashboard-dock-rail' }, ['id']),
            'no rail instance may survive the post-pin re-projection').toEqual([]);
        expect(await app.findInstances({ ntype: 'dashboard-dock-reveal-overlay' }, ['id']),
            'no overlay instance may survive the post-pin re-projection').toEqual([]);
    });

    test('inside prose keeps focus-contained reveal open while native text selection survives', async ({ page, neuralLink }) => {
        const { app, holderId } = await bootDockExample({ page, neuralLink });

        await tuckInspector({ app, holderId, page });

        const
            railTab  = page.locator('.neo-dashboard-dock-rail-tab', {hasText: 'Inspector'}).first(),
            strategy = page.locator('.neo-tab-header-button', {hasText: 'Strategy'}).first();

        await expect(railTab).toBeVisible({timeout: 10000});
        await railTab.click();

        const
            overlay  = page.locator('.neo-dashboard-dock-reveal-overlay').first(),
            paneSlot = overlay.locator('.neo-dashboard-dock-reveal-pane-slot'),
            prose    = paneSlot.getByText('Inspector', {exact: true}).last();

        await expect(overlay).toBeVisible({timeout: 10000});
        await expect(prose, 'the prose-bearing non-focusable pane must be rendered').toBeVisible();

        // Honest reading interaction #1: whitespace in the pane slot keeps the focused reveal.
        await paneSlot.click({position: {x: 12, y: 12}});
        await expect(overlay, 'inside whitespace must not dismiss the reveal').toBeVisible();
        await expect.poll(() => overlay.evaluate(element => document.activeElement === element), {
            message: 'inside mousedown must refocus the tabindex=-1 overlay root'
        }).toBe(true);

        // Honest reading interaction #2: selection remains browser-native. A local listener would
        // preventDefault on mousedown and make this arm red even if the overlay stayed painted.
        await prose.dblclick();
        await expect.poll(() => page.evaluate(() => document.getSelection()?.toString().trim() || ''), {
            message: 'double-clicking the non-focusable prose must produce a native selection'
        }).toContain('Inspector');
        await expect(overlay, 'selecting prose inside must not dismiss the reveal').toBeVisible();

        // The root is programmatic-only: the first Tab reaches the one sequential control inside;
        // the next leaves the subtree and preserves the existing focus-leave dismissal contract.
        await page.keyboard.press('Tab');
        await expect(overlay, 'Tab into the pin control stays inside the reveal').toBeVisible();
        expect(await page.evaluate(() =>
            document.activeElement?.closest('.neo-dashboard-dock-reveal-overlay') !== null
        ), 'the pin control is still inside the overlay subtree').toBe(true);
        await page.keyboard.press('Tab');
        await expect(overlay, 'Tab leaving the subtree must still dismiss').toBeHidden();

        // Independent controls: outside pointer and Escape remain distinct dismissal inputs.
        await railTab.click();
        await expect(overlay).toBeVisible();
        await strategy.click();
        await expect(overlay, 'outside click must still dismiss').toBeHidden();

        await railTab.click();
        await expect(overlay).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(overlay, 'Escape must still dismiss').toBeHidden()
    });

    // Regression guard: a wholesale workspace refresh (removeAll + add) must remove the retired
    // affordance's DOM, not just its worker instances — a destroyed component's lingering
    // in-flight update entry once wedged the ancestor's yielded refresh forever, orphaning the
    // subtree in the main thread.
    test('post-pin DOM reconciliation removes the retired rail affordance (#14911)', async ({ page, neuralLink }) => {

        const { app, holderId } = await bootDockExample({ page, neuralLink });

        await tuckInspector({ app, holderId, page });

        const railTab = page.locator('.neo-dashboard-dock-rail-tab', { hasText: 'Inspector' }).first();
        await expect(railTab).toBeVisible({ timeout: 10000 });
        await railTab.click();
        await page.waitForTimeout(600);

        const overlay = page.locator('.neo-dashboard-dock-reveal-overlay').first();
        await expect(overlay).toBeVisible({ timeout: 10000 });
        await overlay.locator('.neo-dashboard-dock-reveal-pin').first().click();
        await page.waitForTimeout(1500);

        await expect(page.locator('.neo-dashboard-dock-rail-tab'), 'the retired rail tab must leave the DOM').toHaveCount(0);
        await expect(page.locator('.neo-tab-header-button', { hasText: 'Inspector' }).first(),
            'the pinned inspector must re-enter the rendered tab flow').toBeVisible({ timeout: 10000 });
    });

    test('all four edge rails keep intrinsic tab click areas while preserving reveal semantics', async ({ page, neuralLink }) => {
        const { app, holderId, readModel } = await bootDockExample({ page, neuralLink });
        const document                     = createFourEdgeRailDocument();

        // Drive the example's real view-sync seam so DockLayoutAdapter projects all four rails.
        await app.callMethod(holderId, 'onDockZoneDocumentChange', [document]);
        await expect.poll(async () => {
            const rails = await app.findInstances({ntype: 'dashboard-dock-rail'}, ['edge', 'id']);
            return Array.isArray(rails) ? rails.length : rails ? 1 : 0
        }, {message: 'the committed four-edge document projects one rail per edge', timeout: 15000}).toBe(4);

        await expect(page.locator('.neo-dashboard-dock-edge-rail')).toHaveCount(4);

        const committedSnapshot = JSON.stringify(await readModel());

        for (const edge of ['top', 'right', 'bottom', 'left']) {
            const
                rail     = page.locator(`.neo-dashboard-dock-edge-rail-${edge}`),
                tabs     = rail.locator('.neo-dashboard-dock-rail-tab'),
                vertical = edge === 'left' || edge === 'right';

            await expect(rail, `${edge}: one rendered rail`).toHaveCount(1);
            await expect(tabs, `${edge}: both auto-hidden items stay reachable`).toHaveCount(2);

            const geometry = await rail.evaluate((element, isVertical) => {
                const
                    railRect = element.getBoundingClientRect(),
                    tabData  = [...element.querySelectorAll('.neo-dashboard-dock-rail-tab')].map(tab => {
                        const
                            rect      = tab.getBoundingClientRect(),
                            labelRect = tab.querySelector('.neo-button-text').getBoundingClientRect();

                        return {
                            crossExtent   : isVertical ? rect.width : rect.height,
                            flex          : getComputedStyle(tab).flex,
                            labelMainEnd  : isVertical ? labelRect.bottom : labelRect.right,
                            labelMainStart: isVertical ? labelRect.top : labelRect.left,
                            labelRect     : {bottom: labelRect.bottom, left: labelRect.left, right: labelRect.right, top: labelRect.top},
                            mainExtent    : isVertical ? rect.height : rect.width,
                            mainStart     : isVertical ? rect.top : rect.left,
                            rect          : {bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top},
                            writingMode   : getComputedStyle(tab).writingMode
                        }
                    });

                return {
                    crossExtent: isVertical ? railRect.width : railRect.height,
                    gap        : parseFloat(getComputedStyle(element).gap) || 0,
                    mainExtent : isVertical ? railRect.height : railRect.width,
                    tabs       : tabData
                }
            }, vertical);

            const occupied = geometry.tabs.reduce((sum, tab) => sum + tab.mainExtent, 0)
                + geometry.gap * (geometry.tabs.length - 1);

            geometry.tabs.forEach((tab, index) => {
                expect(tab.flex, `${edge} tab ${index}: explicit intrinsic main-axis flex`).toBe('0 0 auto');
                expect(tab.writingMode, `${edge} tab ${index}: edge-appropriate text flow`)
                    .toBe(vertical ? 'vertical-rl' : 'horizontal-tb');

                // The hit area must contain its label on both axes: a theme-pinned fixed
                // button height otherwise clips vertical labels to a 48px box.
                expect(tab.rect.left,   `${edge} tab ${index}: label contained (left)`  ).toBeLessThanOrEqual(tab.labelRect.left   + 0.5);
                expect(tab.rect.top,    `${edge} tab ${index}: label contained (top)`   ).toBeLessThanOrEqual(tab.labelRect.top    + 0.5);
                expect(tab.rect.right,  `${edge} tab ${index}: label contained (right)` ).toBeGreaterThanOrEqual(tab.labelRect.right  - 0.5);
                expect(tab.rect.bottom, `${edge} tab ${index}: label contained (bottom)`).toBeGreaterThanOrEqual(tab.labelRect.bottom - 0.5);

                // The 14px strip owns the cross axis: a theme min-width must not jut past it.
                expect(tab.crossExtent, `${edge} tab ${index}: tab fills exactly the 14px cross axis`)
                    .toBeGreaterThanOrEqual(geometry.crossExtent - 0.5);
                expect(tab.crossExtent, `${edge} tab ${index}: tab does not overflow the 14px cross axis`)
                    .toBeLessThanOrEqual(geometry.crossExtent + 0.5);

                if (index > 0) {
                    expect(tab.labelMainStart, `${edge} tab ${index}: adjacent labels never overlap`)
                        .toBeGreaterThanOrEqual(geometry.tabs[index - 1].labelMainEnd - 0.5)
                }
            });
            expect(geometry.tabs[1].mainStart, `${edge}: document order advances along the edge`)
                .toBeGreaterThan(geometry.tabs[0].mainStart);
            expect(geometry.crossExtent, `${edge}: shared strip keeps its 14px cross-axis extent`).toBe(14);
            expect(geometry.gap, `${edge}: shared strip keeps the 2px document-order gap`).toBe(2);
            expect(occupied, `${edge}: two tabs do not divide and consume the entire rail`).toBeLessThan(geometry.mainExtent * 0.75);

            const overlay = rail.locator('.neo-dashboard-dock-reveal-overlay');

            await tabs.first().click();
            await expect(overlay, `${edge}: the intrinsic tab remains clickable`).toBeVisible({timeout: 10000});
            await expect(overlay.locator('.neo-dashboard-dock-reveal-title'), `${edge}: reveal resolves the clicked item`)
                .toHaveText(`${edge[0].toUpperCase()}${edge.slice(1)} perspectives 1`);
            await page.keyboard.press('Escape');
            await expect(overlay, `${edge}: Escape dismisses the runtime-only reveal`).toBeHidden()
        }

        expect(JSON.stringify(await readModel()), 'four-edge reveal/dismiss gestures never mutate committed truth')
            .toBe(committedSnapshot)
    });
});
