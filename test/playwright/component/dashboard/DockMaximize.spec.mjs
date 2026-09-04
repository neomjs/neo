import {test, expect} from '@playwright/test';

/**
 * The engine-owned dock maximize toggle (`Neo.dashboard.dock.plugin.Maximize`, installed by
 * `Neo.dashboard.dock.Workspace#enableDockMaximizeAction`), witnessed on a rendered workspace
 * rather than on projection JSON:
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
 * are `setConfigs` writes that recompute `getConfigs`-readable mirror fields. The transient and
 * the observer flag live on the plugin, addressed under its fixed fixture id.
 */

const WORKSPACE_ID = 'dock-maximize-workspace';
const PLUGIN_ID    = 'dock-maximize-plugin';

const readInstance = async (page, id, keys) => {
    // The main-realm remote answers with the worker-message envelope; the values ride `.data`.
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id, keys});

    return reply?.data ?? reply
};

const setInstance = (page, id, configs) => page.evaluate(
    data => Neo.worker.App.setConfigs(data),
    {id, ...configs}
);

const readWorkspace = (page, keys)    => readInstance(page, WORKSPACE_ID, keys);
const setWorkspace  = (page, configs) => setInstance(page, WORKSPACE_ID, configs);
const readPlugin    = (page, keys)    => readInstance(page, PLUGIN_ID, keys);
const setPlugin     = (page, configs) => setInstance(page, PLUGIN_ID, configs);

const tabsNodeWith = (page, tabText) => page.locator('.neo-dashboard-dock-tabs', {
    has: page.locator(`.neo-tab-header-button:has-text("${tabText}")`)
});

const tabButton = (node, text) => node.locator('.neo-tab-header-button', {hasText: text});

const actionButton = (node, glyph) => node.locator(`.neo-tab-header-toolbar .neo-button:has([class*="${glyph}"])`);

/**
 * `toHaveCount` on the maximize marker, plus the one observable that splits this arm's failure
 * space when it reds — `maximizedNodeId`, read at failure time.
 *
 * `Maximize#applyPresentation` has two terminal exits that both leave the marker at 0 forever,
 * and the DOM cannot tell them apart:
 *
 * - **`null`** — the fail-safe (`Maximize#fail`) cleared the transient, because the tabs node
 *   did not resolve or `measureRect` returned a 0×0 host rect.
 * - **a surviving id** — the config write landed and the presentation was lost downstream of it.
 *
 * Without that read a failure is a bare "expected 1, received 0" and the two families are
 * indistinguishable. The assertion itself is unchanged; only what a failure reports is.
 * @param {Object} page
 * @param {Number} count
 * @returns {Promise<void>}
 */
const expectMaximizedCount = async (page, count) => {
    try {
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(count)
    } catch (error) {
        let nodeId;

        try {
            [nodeId] = await readPlugin(page, ['maximizedNodeId'])
        } catch (readError) {
            nodeId = `<unreadable: ${readError.message}>`
        }

        error.message += `\n\nmaximizedNodeId at failure: ${JSON.stringify(nodeId)}`;
        throw error
    }
};

/**
 * The maximized node fills the DOCK HOST inset by the gap token on every side — not the workspace
 * root, not the viewport. The expected rect is derived from the rendered host and the token's
 * computed value, so a host framed by other chrome, or a consumer that tunes the gap, both
 * measure against the same contract.
 */
const maximizedRectMatchesHost = page => page.waitForFunction(() => {
    const el   = document.querySelector('.neo-dock-maximized'),
          host = document.querySelector('#dock-maximize-workspace .neo-dashboard');

    if (!el || !host) return false;

    const a   = el.getBoundingClientRect(),
          b   = host.getBoundingClientRect(),
          gap = parseFloat(getComputedStyle(host).getPropertyValue('--dock-maximize-gap')) || 0;

    return Math.abs(a.top - (b.top + gap)) < 1.5 && Math.abs(a.left - (b.left + gap)) < 1.5
        && Math.abs(a.width - (b.width - 2 * gap)) < 1.5 && Math.abs(a.height - (b.height - 2 * gap)) < 1.5
});

/** The rendered maximize chrome: the shadow token applied, no residual band cap. */
const readMaximizedChrome = page => page.evaluate(() => {
    const el = document.querySelector('.neo-dock-maximized'),
          cs = getComputedStyle(el);

    return {boxShadow: cs.boxShadow, maxInlineSize: cs.maxInlineSize, maxBlockSize: cs.maxBlockSize}
});

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-maximize/index.html');
    await page.waitForSelector('#dock-maximize-workspace', {state: 'attached'});
    await page.waitForSelector('#dock-maximize-frame',     {state: 'attached'});
    await page.waitForSelector('.neo-tab-header-button',   {state: 'visible'})
});

test.describe('dock maximize — presentation, never topology', () => {
    test('the toggle is focus-gated beside an always-visible close, in the frozen order', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        // Focus-gated: the maximize control is absent from the DOM until the container holds
        // focus, so it costs no rail space while withdrawn; the close action's `contextual: false`
        // exemption is the visible contrast.
        await expect(actionButton(main, 'fa-window-maximize')).toHaveCount(0);
        await expect(actionButton(main, 'fa-times')).not.toHaveClass(/neo-toolbar-action-context-inactive/);

        await tabButton(main, 'Alpha').click();
        await expect(actionButton(main, 'fa-window-maximize')).not.toHaveClass(/neo-toolbar-action-context-inactive/);

        // The frozen ordering contract, measured as geometry: maximize renders before close.
        const maxBox   = await actionButton(main, 'fa-window-maximize').boundingBox(),
              closeBox = await actionButton(main, 'fa-times').boundingBox();

        expect(maxBox.x).toBeLessThan(closeBox.x)
    });

    test('maximize paints the dock host\'s rect, inset by the gap, on the SAME node — iframe intact — and Escape restores with focus return', async ({page}) => {
        const side = tabsNodeWith(page, 'Frame');

        await page.evaluate(() => {
            const frame = document.getElementById('dock-maximize-frame');

            window.__frameEl              = frame;
            frame.dataset.witness         = 'kept';
            frame.contentWindow.__witness = 'kept'
        });

        await tabButton(side, 'Frame').click();
        await actionButton(side, 'fa-window-maximize').click();

        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);
        await maximizedRectMatchesHost(page);

        const chrome = await readMaximizedChrome(page);

        expect(chrome.boxShadow, 'the maximized pane floats on the shadow token').not.toBe('none');

        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual(['side-tabs']);

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

        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual([null]);

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

    test('an edge-band node maximizes to the same host rect as a center node — the band caps lift for the duration', async ({page}) => {
        const edge = tabsNodeWith(page, 'Pinned');

        await tabButton(edge, 'Pinned').click();
        await actionButton(edge, 'fa-window-maximize').click();

        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);
        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual(['edge-tabs']);

        // The band's `max-inline-size: 50%` used to survive the maximize class and cap the written
        // rect at half the host; the host-rect match below is the regression, the cap read the cause.
        await maximizedRectMatchesHost(page);

        const chrome = await readMaximizedChrome(page);

        expect(chrome.maxInlineSize, 'no band cap on the inline axis while maximized').toBe('none');
        expect(chrome.maxBlockSize,  'no band cap on the block axis while maximized').toBe('none');

        await page.keyboard.press('Escape');
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);

        // Restored: the band measure applies again.
        expect(await edge.evaluate(node => getComputedStyle(node).maxInlineSize), 'the band cap returns on restore').not.toBe('none')
    });

    test('the committed document and captured perspectives never observe maximize', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await setWorkspace(page, {captureCount: 1});

        const [docBefore, perspectiveBefore] = await readWorkspace(page, ['docJson', 'perspectiveJson']);

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        await setWorkspace(page, {captureCount: 2});

        const [docDuring, perspectiveDuring] = await readWorkspace(page, ['docJson', 'perspectiveJson']),
              [nodeId]                       = await readPlugin(page, ['maximizedNodeId']);

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
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        // setActiveItem INSIDE the maximized node: switching tabs keeps it maximized — this is
        // the second click of any real session, and the reason the operation boundary is scoped.
        await tabButton(main, 'Beta').click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);
        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual(['main-tabs']);

        // closeItem INSIDE (the node survives): still maximized.
        await actionButton(main, 'fa-times').click();
        await expect(tabButton(main, 'Beta')).toHaveCount(0);
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        // closeItem OUTSIDE: clears terminally — driven through the reducer because the control
        // it would take sits under the maximized plane, which is itself part of the contract.
        await setWorkspace(page, {closeItemId: 'gamma'});
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);
        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual([null]);

        // Continuity: a NON-operation re-projection re-applies a surviving transient…
        await setPlugin(page, {maximizedNodeId: 'main-tabs'});
        // This re-apply follows a cross-worker write with no committed operation behind it, so a
        // failure here has two indistinguishable families — hence the reporting variant.
        await expectMaximizedCount(page, 1);

        await setWorkspace(page, {refreshCount: 1});
        await page.waitForFunction(() => document.querySelectorAll('.neo-dock-maximized').length === 1);
        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual(['main-tabs']);

        // …and the fail-safe clears an unresolvable one — never a half state. Eventual by
        // contract: the clear is deterministic, not synchronous with the config write.
        await setPlugin(page, {maximizedNodeId: 'ghost-tabs'});
        await page.waitForFunction(() => document.querySelectorAll('.neo-dock-maximized').length === 0);
        await expect.poll(async () => (await readPlugin(page, ['maximizedNodeId']))[0]).toBe(null)
    });

    test('a superseding maximize waits for the prior clear and its refresh', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await expectMaximizedCount(page, 1);

        await setWorkspace(page, {holdMaximizeClear: true});

        // The outside operation clears maximize and opens a projection, while the fixture holds
        // that clear before its presentation mutation.
        await setWorkspace(page, {closeItemId: 'gamma'});
        await expect.poll(async () => JSON.parse(
            (await readWorkspace(page, ['maximizeTransitionLogJson']))[0]
        )).toEqual(['clear:start']);

        // Supersede the clear while it is held. The new apply must queue; starting it here races a
        // stale presentation against both the prior clear and the operation's re-projection.
        await setPlugin(page, {maximizedNodeId: 'main-tabs'});
        expect(JSON.parse((await readWorkspace(page, ['maximizeTransitionLogJson']))[0]))
            .toEqual(['clear:start']);

        await setWorkspace(page, {releaseMaximizeClearCount: 1});
        await expectMaximizedCount(page, 1);
        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual(['main-tabs']);
        await expect.poll(async () => JSON.parse(
            (await readWorkspace(page, ['maximizeTransitionLogJson']))[0]
        ).length).toBeGreaterThanOrEqual(3);

        const transitions = JSON.parse((await readWorkspace(page, ['maximizeTransitionLogJson']))[0]);

        expect(transitions.slice(0, 2)).toEqual(['clear:start', 'clear:apply']);
        expect(transitions.slice(2).length, 'at least one apply must follow the clear').toBeGreaterThan(0);
        expect([...new Set(transitions.slice(2))], 'every later apply is the same idempotent reapply')
            .toEqual(['apply:main-tabs'])
    });

    test('refresh-owned failure does not await a transition waiting on that refresh', async ({page}) => {
        await setWorkspace(page, {maximizeCycleProbeCount: 1});

        await expect.poll(async () => (
            await readWorkspace(page, ['maximizeCycleSyncSettled'])
        )[0]).toBe(true);
        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual([null])
    });

    test('while maximized, the workspace resize observation re-measures the rect live', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await maximizedRectMatchesHost(page);

        // The observation exists exactly as long as the presentation does.
        await expect.poll(async () => (await readPlugin(page, ['resizeObserved']))[0]).toBe(true);

        const original = page.viewportSize();

        await page.setViewportSize({height: original.height - 120, width: original.width - 160});

        // Delivery witnessed, then the re-measured rect re-applied.
        await expect.poll(async () => (await readWorkspace(page, ['resizeEventCount']))[0], {timeout: 10_000}).toBeGreaterThan(0);
        await maximizedRectMatchesHost(page)
    });

    test('while maximized, cross-zone and tear-out drag flags suppress and lift exactly on restore', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

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

    test('addTab confinement: relocating a sibling item clears; catalog-only and in-node adds keep maximize', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        // A catalog-only item added INTO the maximized node is a real add — confined.
        await setWorkspace(page, {addTabJson: JSON.stringify({itemId: 'delta', tabsNodeId: 'main-tabs', index: 2})});
        await expect(tabButton(main, 'Delta')).toHaveCount(1);
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        // An in-node reorder through the addTab→moveItem redirect — confined.
        await setWorkspace(page, {addTabJson: JSON.stringify({itemId: 'beta', tabsNodeId: 'main-tabs', index: 0})});
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);
        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual(['main-tabs']);

        // Relocating a SIBLING's item into the maximized node reaches beyond it: the addTab
        // handler re-dispatches to a cross-node moveItem, and the pre-clear must fire.
        await setWorkspace(page, {addTabJson: JSON.stringify({itemId: 'gamma', tabsNodeId: 'main-tabs', index: 1})});
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);
        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual([null])
    });

    test('engaging maximize dismisses a live reveal overlay — one overlay tier at a time', async ({page}) => {
        const visibleOverlay = page.locator('.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)');

        // Open the auto-hidden item's transient reveal from its rail tab.
        await page.locator('.neo-dashboard-dock-edge-rail').getByText('Railed').click();
        await expect(visibleOverlay).toHaveCount(1);

        // Engage maximize WITHOUT a pointer interaction (setConfigs), so no generic
        // outside-click/focus-leave dismissal can fire first — the deterministic dismissal in
        // the presentation apply is the only thing that can close the overlay here.
        await setPlugin(page, {maximizedNodeId: 'main-tabs'});

        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);
        await expect(visibleOverlay).toHaveCount(0)
    });

    test('the observation lives exactly as long as a presentation — teardown, rapid regeneration, destroy', async ({page}) => {
        await setPlugin(page, {maximizedNodeId: 'main-tabs'});
        await expect.poll(async () => (await readPlugin(page, ['resizeObserved']))[0]).toBe(true);

        // Ordinary restore tears down.
        await setPlugin(page, {maximizedNodeId: null});
        await expect.poll(async () => (await readPlugin(page, ['resizeObserved']))[0]).toBe(false);

        // Rapid A → restore → B: the old restore's deferred unregister must not blind the new
        // generation — B must end observed with resize delivery live.
        await setPlugin(page, {maximizedNodeId: 'main-tabs'});
        await setPlugin(page, {maximizedNodeId: null});
        await setPlugin(page, {maximizedNodeId: 'side-tabs'});
        await expect.poll(async () => await readPlugin(page, ['maximizedNodeId', 'resizeObserved']))
            .toEqual(['side-tabs', true]);

        const before = (await readWorkspace(page, ['resizeEventCount']))[0],
              size   = page.viewportSize();

        await page.setViewportSize({height: size.height - 80, width: size.width - 80});
        await expect.poll(async () => (await readWorkspace(page, ['resizeEventCount']))[0], {timeout: 10_000}).toBeGreaterThan(before);

        // The fail-safe clear tears down.
        await setPlugin(page, {maximizedNodeId: 'ghost-tabs'});
        await expect.poll(async () => await readPlugin(page, ['maximizedNodeId', 'resizeObserved']))
            .toEqual([null, false]);

        // Destroy while observed tears down at the addon — read through the surviving probe.
        await setPlugin(page, {maximizedNodeId: 'main-tabs'});
        await expect.poll(async () => (await readPlugin(page, ['resizeObserved']))[0]).toBe(true);

        await page.evaluate(() => Neo.worker.App.destroyNeoInstance('dock-maximize-workspace'));

        await expect.poll(async () => {
            const reply = await page.evaluate(() => Neo.worker.App.getConfigs({id: 'dock-maximize-probe', keys: ['observerLogJson']})),
                  log   = JSON.parse((reply?.data ?? reply)?.[0] || '[]');

            return log[log.length - 1]
        }).toBe('destroy:true->torn')
    });

    test('re-projection reapply is part of the settled refresh surface', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        // An in-node operation re-projects; a consumer awaiting refreshPromise must already see
        // the re-applied presentation AND the live observation — the settled-surface contract.
        await setWorkspace(page, {closeItemId: 'beta'});
        await setWorkspace(page, {settleProbeCount: 1});

        await expect.poll(async () => JSON.parse((await readWorkspace(page, ['settleJson']))[0] || 'null'))
            .toEqual({maximizedNodeId: 'main-tabs', observed: true, restore: true})
    });

    test('both transitions ride the FLIP motion window and settle clean', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

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
        await maximizedRectMatchesHost(page);

        // The restore glide: the workspace holds `neo-dock-maximize-restoring` (the paint-order
        // hold) for exactly the motion window — it must appear with the gesture and leave when
        // the play settles, leaving no inline rect values behind.
        await actionButton(main, 'fa-window-minimize').click();

        await page.waitForFunction(() => document.querySelector('.neo-dock-maximize-restoring') !== null, undefined, {timeout: 3000});

        // The restore glide is a REAL inverted transform on the restoring node, not only the
        // paint-order sentinel.
        await page.waitForFunction(() => {
            const el = document.querySelector('.neo-dock-maximize-restoring');

            return el && el.style.transform !== ''
        }, undefined, {timeout: 3000});

        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);
        await page.waitForFunction(() => document.querySelector('.neo-dock-maximize-restoring') === null);

        await page.waitForFunction(() => {
            const el = document.getElementById('dock-maximize-pane-alpha')?.closest('.neo-dashboard-dock-tabs');

            return el && !el.style.top && !el.style.width && el.style.transform === ''
        }, undefined, {timeout: 8000}).catch(async () => {
            const residual = await page.evaluate(() => document.getElementById('dock-maximize-pane-alpha')
                ?.closest('.neo-dashboard-dock-tabs')?.getAttribute('style'));

            await setWorkspace(page, {styleProbeCount: 1});

            const worker = (await readWorkspace(page, ['styleProbeJson']))[0];

            throw new Error(`restore left residual inline style: ${residual} · worker-side: ${worker}`)
        })
    })
});
