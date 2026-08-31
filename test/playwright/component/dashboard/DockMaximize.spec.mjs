import {test, expect} from '@playwright/test';

/**
 * The engine-owned dock maximize toggle (`Neo.dashboard.dock.Workspace#enableDockMaximizeAction`),
 * witnessed on a rendered workspace rather than on projection JSON:
 *
 * - **Presentation, never topology.** The pane paints the MEASURED workspace rect in place — the
 *   same DOM node, the same iframe browsing context — and the committed document plus captured
 *   perspectives stay byte-identical through the whole round-trip.
 * - **The operation boundary.** Operations confined to the maximized node (activating a tab,
 *   closing a tab inside it) keep it maximized through the survived-transient continuity rule;
 *   any operation reaching outside clears it terminally, before the refresh re-projects.
 * - **Input + motion contract.** Escape restores with focus returning to the active header
 *   button; cross-zone/tear-out drag flags suppress while the in-strip zone stays armed; both
 *   transitions ride the DockFlip motion window and collapse to the instant path under reduced
 *   motion.
 *
 * The fixture's reactive trigger configs are the spec's only cross-worker RPC: worker-side probes
 * are `setConfigs` writes that recompute `getConfigs`-readable mirror fields.
 */

const WORKSPACE_ID = 'dock-maximize-workspace';

const readWorkspace = async (page, keys) => {
    // The main-realm remote answers with the worker-message envelope; the values ride `.data`.
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id: WORKSPACE_ID, keys});

    return reply?.data ?? reply
};

const setWorkspace = (page, configs) => page.evaluate(
    data => Neo.worker.App.setConfigs(data),
    {id: WORKSPACE_ID, ...configs}
);

const tabsNode = (page, index) => page.locator('.neo-dashboard-dock-tabs').nth(index);

const tabButton = (node, text) => node.locator('.neo-tab-header-button', {hasText: text});

const actionButton = (node, glyph) => node.locator(`.neo-tab-header-toolbar .neo-button:has([class*="${glyph}"])`);

const maximizedRectMatchesWorkspace = page => page.waitForFunction(() => {
    const el = document.querySelector('.neo-dock-maximized'),
          ws = document.getElementById('dock-maximize-workspace');

    if (!el || !ws) return false;

    const a = el.getBoundingClientRect(),
          b = ws.getBoundingClientRect();

    return Math.abs(a.top - b.top) < 1.5 && Math.abs(a.left - b.left) < 1.5
        && Math.abs(a.width - b.width) < 1.5 && Math.abs(a.height - b.height) < 1.5
});

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-maximize/index.html');
    await page.waitForSelector('#dock-maximize-workspace', {state: 'attached'});
    await page.waitForSelector('#dock-maximize-frame',     {state: 'attached'});
    await page.waitForSelector('.neo-tab-header-button',   {state: 'visible'})
});

test.describe('dock maximize — presentation, never topology', () => {
    test('the toggle is focus-gated beside an always-visible close, in the frozen order', async ({page}) => {
        const main = tabsNode(page, 0);

        // Focus-gated through the toolbar's geometry-preserving carrier: the maximize control is
        // rendered but context-inactive until the container holds focus; the close action's
        // `contextual: false` exemption is the visible contrast.
        await expect(actionButton(main, 'fa-window-maximize')).toHaveClass(/neo-toolbar-action-context-inactive/);
        await expect(actionButton(main, 'fa-times')).not.toHaveClass(/neo-toolbar-action-context-inactive/);

        await tabButton(main, 'Alpha').click();
        await expect(actionButton(main, 'fa-window-maximize')).not.toHaveClass(/neo-toolbar-action-context-inactive/);

        // The frozen ordering contract, measured as geometry: maximize renders before close.
        const maxBox   = await actionButton(main, 'fa-window-maximize').boundingBox(),
              closeBox = await actionButton(main, 'fa-times').boundingBox();

        expect(maxBox.x).toBeLessThan(closeBox.x)
    });

    test('maximize paints the measured workspace rect on the SAME node — iframe intact — and Escape restores with focus return', async ({page}) => {
        const side = tabsNode(page, 1);

        await page.evaluate(() => {
            const frame = document.getElementById('dock-maximize-frame');

            window.__frameEl              = frame;
            frame.dataset.witness         = 'kept';
            frame.contentWindow.__witness = 'kept'
        });

        await tabButton(side, 'Frame').click();
        await actionButton(side, 'fa-window-maximize').click();

        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);
        await maximizedRectMatchesWorkspace(page);

        expect(await readWorkspace(page, ['maximizedNodeId'])).toEqual(['side-tabs']);

        // No re-parent: the identical element, the identical browsing context. A re-parented
        // iframe reloads, wiping `contentWindow` expando state.
        expect(await page.evaluate(() => {
            const frame = document.getElementById('dock-maximize-frame');

            return frame === window.__frameEl
                && frame.dataset.witness === 'kept'
                && frame.contentWindow.__witness === 'kept'
        })).toBe(true);

        await page.keyboard.press('Escape');

        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);
        await page.waitForFunction(() => {
            const el = document.getElementById('dock-maximize-frame')?.closest('.neo-dashboard-dock-tabs');

            return el && !el.style.top && !el.style.width
        });

        expect(await readWorkspace(page, ['maximizedNodeId'])).toEqual([null]);

        expect(await page.evaluate(() => {
            const frame = document.getElementById('dock-maximize-frame');

            return frame === window.__frameEl && frame.contentWindow.__witness === 'kept'
        })).toBe(true);

        // Focus returned to the restored node's active header button.
        await page.waitForFunction(() =>
            document.activeElement?.classList?.contains('neo-tab-header-button')
            && document.activeElement.textContent.includes('Frame')
        )
    });

    test('the committed document and captured perspectives never observe maximize', async ({page}) => {
        const main = tabsNode(page, 0);

        await setWorkspace(page, {captureCount: 1});

        const [docBefore, perspectiveBefore] = await readWorkspace(page, ['docJson', 'perspectiveJson']);

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        await setWorkspace(page, {captureCount: 2});

        const [docDuring, perspectiveDuring, nodeId] =
            await readWorkspace(page, ['docJson', 'perspectiveJson', 'maximizedNodeId']);

        expect(nodeId).toBe('main-tabs');
        expect(docDuring).toBe(docBefore);
        expect(perspectiveDuring).toBe(perspectiveBefore);

        // Restore through the same toggle — its icon flipped to the restore half.
        await actionButton(main, 'fa-window-minimize').click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);

        const [docAfter] = await readWorkspace(page, ['docJson']);

        expect(docAfter).toBe(docBefore)
    });

    test('inside-the-node operations keep maximize, outside operations clear it terminally, and continuity re-applies iff the node survives', async ({page}) => {
        const main = tabsNode(page, 0);

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        // setActiveItem INSIDE the maximized node: switching tabs keeps it maximized — this is
        // the second click of any real session, and the reason the operation boundary is scoped.
        await tabButton(main, 'Beta').click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);
        expect(await readWorkspace(page, ['maximizedNodeId'])).toEqual(['main-tabs']);

        // closeItem INSIDE (the node survives): still maximized.
        await actionButton(main, 'fa-times').click();
        await expect(tabButton(main, 'Beta')).toHaveCount(0);
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        // closeItem OUTSIDE: clears terminally — driven through the reducer because the control
        // it would take sits under the maximized plane, which is itself part of the contract.
        await setWorkspace(page, {closeItemId: 'gamma'});
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);
        expect(await readWorkspace(page, ['maximizedNodeId'])).toEqual([null]);

        // Continuity: a NON-operation re-projection re-applies a surviving transient…
        await setWorkspace(page, {maximizedNodeId: 'main-tabs'});
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        await setWorkspace(page, {refreshCount: 1});
        await page.waitForFunction(() => document.querySelectorAll('.neo-dock-maximized').length === 1);
        expect(await readWorkspace(page, ['maximizedNodeId'])).toEqual(['main-tabs']);

        // …and the fail-safe clears an unresolvable one — never a half state.
        await setWorkspace(page, {maximizedNodeId: 'ghost-tabs'});
        await page.waitForFunction(() => document.querySelectorAll('.neo-dock-maximized').length === 0);
        expect(await readWorkspace(page, ['maximizedNodeId'])).toEqual([null])
    });

    test('while maximized, the workspace resize observation re-measures the rect live', async ({page}) => {
        const main = tabsNode(page, 0);

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await maximizedRectMatchesWorkspace(page);

        // The observation exists exactly as long as the presentation does.
        await expect.poll(async () => (await readWorkspace(page, ['dockMaximizeResizeObserved']))[0]).toBe(true);

        const original = page.viewportSize();

        await page.setViewportSize({height: original.height - 120, width: original.width - 160});

        // Delivery witnessed, then the re-measured rect re-applied.
        await expect.poll(async () => (await readWorkspace(page, ['resizeEventCount']))[0], {timeout: 10_000}).toBeGreaterThan(0);
        await maximizedRectMatchesWorkspace(page)
    });

    test('while maximized, cross-zone and tear-out drag flags suppress and lift exactly on restore', async ({page}) => {
        const main = tabsNode(page, 0);

        await setWorkspace(page, {zoneSnapshotCount: 1});

        const [before] = await readWorkspace(page, ['zoneSnapshotJson']);

        // The engine default: the workspace root is the ordinary cross-zone boundary.
        expect(JSON.parse(before).boundaryContainerId).toBe(WORKSPACE_ID);

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        await setWorkspace(page, {zoneSnapshotCount: 2});

        const flags = JSON.parse((await readWorkspace(page, ['zoneSnapshotJson']))[0]);

        // In-strip sorting stays armed — the zone lives on, clamped to its own toolbar; the
        // cross-zone exit and the popup grammar cannot fire.
        expect(flags.allowOverdrag).toBe(false);
        expect(flags.enableProxyToPopup).toBe(false);
        expect(flags.boundaryContainerId).not.toBe(WORKSPACE_ID);

        await page.keyboard.press('Escape');
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);

        await setWorkspace(page, {zoneSnapshotCount: 3});

        expect(JSON.parse((await readWorkspace(page, ['zoneSnapshotJson']))[0])).toEqual(JSON.parse(before))
    });

    test('both transitions ride the FLIP motion window and settle clean', async ({page}) => {
        const main = tabsNode(page, 0);

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();

        // The maximize glide: DockFlip installs the inverted transform and releases it into the
        // token-timed transition — a transient non-empty inline transform on the maximized node
        // is the motion, witnessed mid-flight. (The instant-path degradations — reduced motion,
        // hidden documents, frame starvation — are the addon's own spec-covered contract; this
        // arm proves the maximize toggle actually rides that contract.)
        await page.waitForFunction(() => {
            const el = document.querySelector('.neo-dock-maximized');

            return el && el.style.transform !== ''
        }, undefined, {timeout: 3000});

        // …and settles clean: the transform releases, the measured rect owns the geometry.
        await page.waitForFunction(() => {
            const el = document.querySelector('.neo-dock-maximized');

            return el && el.style.transform === ''
        });
        await maximizedRectMatchesWorkspace(page);

        // The restore glide: the workspace holds `neo-dock-maximize-restoring` (the paint-order
        // hold) for exactly the motion window — it must appear with the gesture and leave when
        // the play settles, leaving no inline rect values behind.
        await actionButton(main, 'fa-window-minimize').click();

        await page.waitForFunction(() => document.querySelector('.neo-dock-maximize-restoring') !== null, undefined, {timeout: 3000});
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);
        await page.waitForFunction(() => document.querySelector('.neo-dock-maximize-restoring') === null);

        await page.waitForFunction(() => {
            const el = document.getElementById('dock-maximize-pane-alpha')?.closest('.neo-dashboard-dock-tabs');

            return el && !el.style.top && !el.style.width && el.style.transform === ''
        })
    })
});
