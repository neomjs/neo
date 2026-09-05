import { test, expect } from '../../fixtures.mjs';
import fs               from 'fs';
import path             from 'path';
import {fileURLToPath}  from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
      configPath = path.resolve(__dirname, '../../../../examples/dashboard/dock/neo-config.json'),
      engineThemes = [
          'neo-theme-dark',
          'neo-theme-light',
          'neo-theme-neo-dark',
          'neo-theme-neo-light'
      ];

/**
 * Whitebox-e2e: the gesture proof for the pin/collapse ENTRY of the auto-hide round-trip
 * (docking design record §2.7).
 *
 * `DockAutoHideRevealNL` proves the way BACK — a committed auto-hidden item rails, the rail reveals,
 * and the overlay's pin control returns it. It has to auto-hide its subject programmatically first,
 * because until this leaf no affordance sent a pane TO the rail. This spec closes that loop with a
 * real gesture: the pane's own header action collapses it, and the existing reveal path brings it
 * home. The product truths a unit spec cannot certify are
 *
 *   1. the projected `pin` action is a REAL, clickable button in the tab header,
 *   2. pressing it commits §2.7's sequence in the App Worker and the pane genuinely leaves its tab
 *      flow for a rail button on its owning edge,
 *   3. the round-trip closes — the revealed overlay's pin control puts the pane back — so the two
 *      halves compose rather than each merely working in isolation,
 *   4. the affordance is absent where the gesture could not complete: the center pane, which §2.7
 *      never rails.
 *
 * Paradigm (whitebox-e2e protocol): Playwright drives the native clicks; the Neural Link fixture
 * reads the holder's committed `dockModel` at every stage. NOTHING here is committed programmatically
 * — every mutation in this spec comes from a real gesture, which is the point of it.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=/path/to/neo-agent-brain NEO_E2E_PORT=8091 npx playwright test \
 *      DockPinCollapseNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * The runtime root is a PREREQUISITE, not a convenience: `playwright.config.e2e.mjs` builds its
 * `testIgnore` from `selectExternalBrainSpecs` whenever `NEO_AGENTOS_RUNTIME_ROOT` is unset, so a
 * run without it does not fail this spec — it never selects it, and reports "No tests found". The
 * config announces that exclusion at startup, naming how many spec files it dropped. The port
 * override isolates from any foreign dev-server squatting on 8080.
 */

const bootDockExample = async ({ page, neuralLink, theme }) => {
    if (theme) {
        const config = {...JSON.parse(fs.readFileSync(configPath, 'utf8')), themes: [theme]};

        await page.route('**/examples/dashboard/dock/neo-config.json*', route =>
            route.fulfill({contentType: 'application/json', body: JSON.stringify(config)}))
    }

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

/** Resolves the live projected TabContainer id for one semantic dock node. */
const tabsNodeId = async (app, dockNodeId) => {
    const records = await app.queryComponent({ dockNodeId }, ['id', 'ntype']),
          record  = Array.isArray(records) ? records[0] : records;

    return record?.id ?? record?.properties?.id
};

/**
 * Clicks one pane's tab header, which is how a user gives that pane focus. The engine set is
 * FOCUS-GATED (`showOnFocus`, `visibility: hidden` while closed), so without this the actions are
 * invisible for a reason that has nothing to do with the policy under test.
 */
const focusPane = async (app, page, dockItemId) => {
    const records = await app.findInstances({ className: 'Neo.tab.header.Button', dockItemId }, ['id', 'dockItemId']),
          record  = Array.isArray(records) ? records[0] : records,
          id      = record?.id ?? record?.properties?.id;

    expect(id, `the ${dockItemId} pane owns a live tab header button`).toBeTruthy();
    await page.locator(`#${id}`).click();
    await page.waitForTimeout(400);

    return id
};

/** @summary Reads active inline-tab title geometry and typography from its real button. */
const readInlineTitleChrome = button => button.evaluate(node => {
    const
        title     = node.querySelector('.neo-button-text'),
        buttonBox = node.getBoundingClientRect(),
        titleBox  = title.getBoundingClientRect(),
        rootStyle = getComputedStyle(node),
        style     = getComputedStyle(title);

    return {
        backgroundColor: rootStyle.backgroundColor,
        backgroundImage: rootStyle.backgroundImage,
        border         : rootStyle.border,
        borderRadius   : rootStyle.borderRadius,
        color          : style.color,
        fontFamily     : style.fontFamily,
        fontSize       : style.fontSize,
        fontWeight     : style.fontWeight,
        height         : buttonBox.height,
        inset          : titleBox.left - buttonBox.left,
        lineHeight     : style.lineHeight,
        padding        : rootStyle.padding,
        textTransform: style.textTransform
    }
});

/**
 * @summary Reads target-specific reveal-pin paint and compact geometry from the browser.
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<Object>}
 */
const readRevealPinStyle = locator => locator.evaluate(element => {
    const
        style      = getComputedStyle(element),
        glyphStyle = getComputedStyle(element.querySelector('.neo-button-glyph'));

    return {
        backgroundColor: style.backgroundColor,
        border         : style.border,
        glyphColor     : glyphStyle.color,
        height         : Number.parseFloat(style.height),
        opacity        : Number.parseFloat(style.opacity),
        text           : element.textContent.trim(),
        width          : Number.parseFloat(style.width)
    }
});

test.describe('Dock pin/collapse round-trip (Neural Link)', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 } });

    test('the header pin action collapses a pane to its edge rail, and the reveal overlay brings it back', async ({ page, neuralLink }) => {
        const { app, readModel } = await bootDockExample({ page, neuralLink });

        // Setup truth: the inspector sits VISIBLE in the right edge band, and nothing rails yet. The
        // sibling spec has to commit an auto-hide here; this one gets there by pressing a button.
        const before = await readModel();

        expect(before?.nodes?.['inspector-tabs']?.items, 'the example seeds the inspector in the right edge band').toEqual(['inspector']);
        expect(before?.items?.inspector?.autoHidden, 'the inspector must start visible').not.toBe(true);
        await expect(page.locator('.neo-dashboard-dock-edge-rail .neo-dashboard-dock-rail-tab')).toHaveCount(0);

        const inspectorTabsId = await tabsNodeId(app, 'inspector-tabs'),
              mainTabsId      = await tabsNodeId(app, 'main-tabs');

        expect(inspectorTabsId, 'the inspector band projects a live TabContainer').toBeTruthy();
        expect(mainTabsId,      'the center stack projects a live TabContainer').toBeTruthy();

        // Product truth #1: the opt-in projects a real action instance on the edge-owned pane.
        await expect.poll(async () => (await app.callMethod(inspectorTabsId, 'getAction', ['pin']))?.id, {
            message: 'the opt-in projection materialises one persistent pin action',
            timeout: 10000
        }).toBeTruthy();

        // The instance is worker truth from the first projection. Its NODE is not: a focus-gated
        // action that is withdrawn has no DOM node at all (the toolbar withholds it rather than
        // hiding it, so no stylesheet can resurrect it), and this header holds no focus yet. The
        // accessible name and glyph are read below, once the gate is open.
        const pinAction = await app.callMethod(inspectorTabsId, 'getAction', ['pin']),
              pinButton = page.locator(`#${pinAction.id}`);

        await expect(pinButton, 'a withdrawn action has no node before its header has focus').toHaveCount(0);

        // Product truth #4: §2.7's fail-safe reaches the real product — the center stack projects the
        // action too, but hidden, because main content never rails.
        //
        // The center pane is FOCUSED first on purpose. The engine set is focus-gated, so an unfocused
        // header hides every action of it; asserting invisibility there would pass whether or not the
        // center rule exists. With the gate open, the only thing that can still hide this control is
        // the policy under test.
        await focusPane(app, page, 'strategy');

        const centerPin = await app.callMethod(mainTabsId, 'getAction', ['pin']);

        expect(centerPin?.id, 'the center stack projects the action instance').toBeTruthy();
        expect(centerPin.hidden, 'a center-owned pane must not offer the collapse').toBe(true);
        await expect(page.locator(`#${centerPin.id}`), 'and it is not reachable in the DOM either').toBeHidden();

        // The control arm for that gate: the close action, which opts OUT of focus gating, IS visible
        // on the very same focused header — so "hidden" above is this action's policy, not the gate.
        const centerClose = await app.callMethod(mainTabsId, 'getAction', ['close']);

        await expect(page.locator(`#${centerClose.id}`), 'the ungated close action proves the header is live').toBeVisible();

        // Native gesture: collapse the inspector from its OWN header, once that pane holds focus.
        await focusPane(app, page, 'inspector');
        await expect(pinButton, 'a focused edge-owned pane offers the collapse').toBeVisible({ timeout: 10000 });
        await expect(pinButton).toHaveAttribute('aria-label', 'unpin');
        await expect(pinButton.locator('.neo-button-glyph')).toHaveClass(/fa-thumbtack-slash/);
        await pinButton.click();

        // Product truth #2: worker truth carries the collapse, committed through the semantic path.
        await expect.poll(async () => (await readModel())?.items?.inspector?.autoHidden, {
            message: 'the real header action commits the collapse through the model',
            timeout: 10000
        }).toBe(true);

        const collapsed = await readModel();

        // The item is unpinned-and-hidden, never both — the exclusivity §2.7's sequence exists to keep.
        expect(collapsed.items.inspector.pinned, 'the collapse leaves the item unpinned').not.toBe(true);

        // ...and it genuinely LEFT the tab flow for a rail button on the edge that owns it.
        const railTab = page.locator('.neo-dashboard-dock-rail-tab', { hasText: 'Inspector' }).first();

        await expect(railTab, 'the collapsed pane must become a labeled edge-rail tab').toBeVisible({ timeout: 10000 });
        await expect(
            page.locator('.neo-dashboard-dock-edge-rail-right .neo-dashboard-dock-rail-tab'),
            'the rail is the one on its OWNING edge, not merely some rail'
        ).toHaveCount(1);

        // Product truth #3: the loop closes. The existing reveal path takes it from here.
        await railTab.click();
        await page.waitForTimeout(600);

        const overlay = page.locator('.neo-dashboard-dock-reveal-overlay').first();

        await expect(overlay, 'the reveal overlay must open on rail-tab click').toBeVisible({ timeout: 10000 });
        expect(JSON.stringify(await readModel()), 'the reveal stays runtime-only').toBe(JSON.stringify(collapsed));

        await overlay.locator('.neo-dashboard-dock-reveal-pin').first().click();

        await expect.poll(async () => (await readModel())?.items?.inspector?.pinned, {
            message: 'the overlay pin control returns the pane through the reducer',
            timeout: 10000
        }).toBe(true);

        const restored = await readModel();

        expect(restored.items.inspector.autoHidden, 'returning clears the collapse').toBe(false);
        expect(restored.nodes['inspector-tabs'].items, 'the pane is back in its tab flow').toEqual(['inspector']);
        await expect(
            page.locator('.neo-dashboard-dock-edge-rail .neo-dashboard-dock-rail-tab'),
            'and the rail it came from is gone'
        ).toHaveCount(0);

        // The round-trip is a round trip: everything except the pin flag the reveal path sets is back
        // where it started, so the gesture pair leaves no residue in committed state.
        expect({ ...restored.items.inspector, pinned: undefined, autoHidden: undefined })
            .toEqual({ ...before.items.inspector, pinned: undefined, autoHidden: undefined });
        expect(restored.nodes).toEqual(before.nodes)
    })

    for (const theme of engineThemes) {
        test(`the reveal pin is compact and legible under ${theme}`, async ({page, neuralLink}) => {
            const {app, readModel} = await bootDockExample({page, neuralLink, theme});

            const inspectorButtonId = await focusPane(app, page, 'inspector');

            await page.mouse.move(0, 0);

            const
                inspectorTabsId = await tabsNodeId(app, 'inspector-tabs'),
                pinAction       = await app.callMethod(inspectorTabsId, 'getAction', ['pin']),
                pinButton       = page.locator(`#${pinAction.id}`),
                inlineAction    = await readRevealPinStyle(pinButton),
                inlineTitle     = await readInlineTitleChrome(page.locator(`#${inspectorButtonId}`));

            await expect(pinButton).toHaveAttribute('aria-label', 'unpin');
            await expect(pinButton.locator('.neo-button-glyph')).toHaveClass(/fa-thumbtack-slash/);
            await pinButton.click();
            await expect.poll(async () => (await readModel()).items.inspector.autoHidden, {
                timeout: 10000
            }).toBe(true);

            await page.locator('.neo-dashboard-dock-edge-rail-right .neo-dashboard-dock-rail-tab')
                .filter({hasText: 'Inspector'})
                .click();

            const
                overlay = page.locator('.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)'),
                header  = overlay.locator('.neo-dashboard-dock-reveal-header'),
                restore = overlay.locator('.neo-dashboard-dock-reveal-pin'),
                title   = overlay.locator('.neo-dashboard-dock-reveal-title');

            await expect(overlay).toBeVisible({timeout: 10000});
            await expect(restore).toHaveClass(/neo-toolbar-action/);
            await expect(restore).not.toHaveClass(/neo-button-ghost/);
            await expect(restore).toHaveAttribute('aria-label', 'Pin');

            const enabled = await readRevealPinStyle(restore);

            expect(enabled, `${theme} reveal and inline actions share exact chrome`).toEqual(inlineAction);
            expect(await readInlineTitleChrome(title),
                `${theme} reveal and active inline titles share inset, height and typography`).toEqual(inlineTitle);
            expect(enabled.text, `${theme} keeps the control icon-only`).toBe('');
            expect(enabled.width, `${theme} keeps compact width`).toBeLessThanOrEqual(48);
            expect(enabled.height, `${theme} keeps compact height`).toBeLessThanOrEqual(48);
            expect(enabled.glyphColor, `${theme} paints a legible glyph`).not.toBe('rgba(0, 0, 0, 0)');
            expect(enabled.backgroundColor, `${theme} does not regress to the blue primary CTA`)
                .not.toBe('rgb(67, 93, 177)');
            await expect(header).toHaveScreenshot(`reveal-pin-${theme}-enabled.png`, {animations: 'disabled'});

            const restoreId = await restore.getAttribute('id');

            expect(restoreId).toBeTruthy();
            await app.setProperties(restoreId, {disabled: true});
            await expect(restore).toHaveAttribute('disabled', '');
            await expect(restore).toHaveClass(/neo-disabled/);

            const disabled = await readRevealPinStyle(restore);

            expect(disabled.opacity, `${theme} disabled state remains visible`).toBeGreaterThan(0);
            expect(disabled.opacity, `${theme} disabled state differs from enabled`).toBeLessThan(enabled.opacity);
            expect(disabled.glyphColor, `${theme} disabled glyph remains painted`).not.toBe('rgba(0, 0, 0, 0)');
            await expect(header).toHaveScreenshot(`reveal-pin-${theme}-disabled.png`, {animations: 'disabled'})
        })
    }
});
