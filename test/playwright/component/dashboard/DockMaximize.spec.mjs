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
 * The fail-safe clear of an unresolvable id is eventual by contract: the transition waits for the
 * owner's live refresh before it applies and fails. When that wait outlives the poll, the bare
 * `expected null, received "ghost-tabs"` cannot say which side is pending, and the two are different
 * defects: a refresh that has not settled (the settle probe, which awaits the live `refreshPromise`,
 * does not answer) or a transition still parked behind a refresh that has. The assertion is
 * unchanged; the failure carries the discriminator and the plugin's observer state.
 * @param {Object} page
 * @returns {Promise<void>}
 */
const expectIdCleared = async page => {
    try {
        await expect.poll(async () => (await readPlugin(page, ['maximizedNodeId']))[0]).toBe(null)
    } catch (error) {
        let diagnosis;

        try {
            const [settleBefore] = await readWorkspace(page, ['settleJson']);

            await setWorkspace(page, {settleProbeCount: Date.now()});

            let refreshSettled = true;

            try {
                await expect.poll(async () => (await readWorkspace(page, ['settleJson']))[0], {timeout: 2000}).not.toBe(settleBefore)
            } catch (settleError) {
                refreshSettled = false
            }

            const [nodeId, resizeObserved]   = await readPlugin(page, ['maximizedNodeId', 'resizeObserved']),
                  [inFlight, settleTimedOut] = await readWorkspace(page, ['refreshInFlight', 'settleTimedOut']);

            // `refreshSettledWithin2s` only reports whether the PROBE published, which it now
            // always does — the settlement answer is `settleTimedOut`, and `inFlight` separates
            // "no receipt was published" from "a refresh is still running".
            diagnosis = `maximizedNodeId=${JSON.stringify(nodeId)} resizeObserved=${resizeObserved} refreshSettledWithin2s=${refreshSettled} settleTimedOut=${settleTimedOut} refreshInFlight=${inFlight}`
        } catch (readError) {
            diagnosis = `<unreadable: ${readError.message}>`
        }

        error.message += `\n\nat failure: ${diagnosis}`;
        throw error
    }
};

/**
 * The maximized node fills the DOCK AREA inset by the gap token on every side — not the workspace
 * root, not the viewport. The fixture workspace is its own host and frames the projected shell
 * with a 42px chrome bar at index 0 (`dockShellIndex: 1`), so the root and the shell have different
 * rects: the expected rect is derived from the rendered shell and the token's computed value, and
 * the bar must stay uncovered. A consumer that tunes the gap measures against the same contract.
 */
const maximizedRectMatchesHost = page => page.waitForFunction(() => {
    const el     = document.querySelector('.neo-dock-maximized'),
          host   = document.querySelector('#dock-maximize-workspace .neo-dashboard'),
          chrome = document.getElementById('dock-maximize-chrome');

    if (!el || !host || !chrome) return false;

    const a   = el.getBoundingClientRect(),
          b   = host.getBoundingClientRect(),
          gap = parseFloat(getComputedStyle(host).getPropertyValue('--dock-maximize-gap')) || 0;

    return Math.abs(a.top - (b.top + gap)) < 1.5 && Math.abs(a.left - (b.left + gap)) < 1.5
        && Math.abs(a.width - (b.width - 2 * gap)) < 1.5 && Math.abs(a.height - (b.height - 2 * gap)) < 1.5
        && a.top >= chrome.getBoundingClientRect().bottom - 0.5
});

/**
 * @summary Resolves once a FLIP has actually landed: the inline transform is released AND no
 * transition is still running on the node.
 *
 * `waitForFunction(() => !el.style.transform)` is NOT a settle condition. When a maximize play
 * exposes its destination for a stretch of frames, the inline transform is empty for that whole
 * exposure, so the check resolves instantly — mid-flash — and callers measure the committed
 * geometry by accident. Once the invert installs in time, the same check resolves at RELEASE
 * instead, with the node still gliding, and a geometry read there is simply wrong.
 *
 * Deliberately says nothing about WHERE the node lands: callers assert that themselves, so this
 * wait cannot quietly subsume the assertion it is protecting.
 * @param {Object} page
 * @param {String} selector
 * @returns {Promise<void>}
 */
const waitForFlipSettled = (page, selector) => page.waitForFunction(sel => {
    const el = document.querySelector(sel);

    // Rect stability is NOT sufficient on its own: an eased transition moves well under a pixel
    // across its first frame, so "unchanged since last frame" reports settled at the START of the
    // glide. The running transition is the authority — it exists for exactly as long as the
    // motion does — and the cleared inline transform confirms the invert was released rather
    // than never installed.
    return el && !el.style.transform && el.getAnimations().length === 0
}, selector, {timeout: 5000});

/**
 * @summary Starts a per-frame sampler on the tabs node, for witnessing a FLIP at frame resolution.
 *
 * The defect this exists for is invisible to every settled-state assertion and to
 * `waitForFunction`: both sample asynchronously, long after the exposed frames are gone. It also
 * cannot key on the marker class, which lands in the same mutation as the geometry — a sampler
 * started from the marker never sees the frames before it. So the node is addressed by its stable
 * pane id, and sampling starts BEFORE the gesture.
 *
 * `getBoundingClientRect()` is the right probe precisely because it includes transforms: an
 * inverted node measures at its FIRST rect, an un-inverted one at its destination. That is the
 * whole discriminator.
 * @param {Object} page
 * @returns {Promise<void>}
 */
const startFlipSampler = page => page.evaluate(() => {
    window.__flipFrames = [];

    let stop = false;

    window.__flipStop = () => {stop = true};

    const tick = () => {
        const el = document.getElementById('dock-maximize-pane-alpha')?.closest('.neo-dashboard-dock-tabs');

        if (el) {
            const rect = el.getBoundingClientRect();

            window.__flipFrames.push({
                height   : Math.round(rect.height),
                transform: getComputedStyle(el).transform,
                width    : Math.round(rect.width)
            })
        }

        stop || requestAnimationFrame(tick)
    };

    requestAnimationFrame(tick)
});

/**
 * @summary Counts frames that painted the node at its destination before the glide began.
 *
 * Purely geometric, and deliberately so. The obvious rule — "at the destination while the
 * transform is still identity" — is unusable on the restore path: a settled maximized node
 * already carries a committed non-identity matrix, so "the first non-identity frame" is frame 0
 * and the ordering clause it anchors selects nothing. That version reported a clean 0 on source
 * measured to expose 16 frames, which is the exact failure AC-3 forbids.
 *
 * So the pivot is motion itself. A healthy FLIP walks `start → intermediate → … → destination`;
 * an exposed one jumps `start → destination → start → intermediate → … → destination`. Anything
 * sitting at the destination *before the first intermediate size* was therefore painted there
 * without an inverse transform holding it back, whichever direction is under test and whatever
 * residual transform the node started with.
 *
 * Start and destination come from the first and last sampled frames, so neither direction needs
 * the host rect or the gap token, and restore's flow slot need not be predicted.
 * @param {Object} page
 * @returns {Promise<Object>} `{destination, flashes, frames, glideAt, start}`
 */
const readFlipFrames = async page => {
    await page.evaluate(() => window.__flipStop());

    return page.evaluate(() => {
        const frames      = window.__flipFrames,
              start       = frames[0],
              destination = frames[frames.length - 1],
              near        = (a, b) => Math.abs(a.width - b.width) < 2 && Math.abs(a.height - b.height) < 2,
              // The first frame at neither end of the journey: proof the glide is under way.
              glideAt     = frames.findIndex(frame => !near(frame, start) && !near(frame, destination));

        return {
            destination: `${destination.width}x${destination.height}`,
            flashes    : frames.filter((frame, index) =>
                (glideAt < 0 || index < glideAt) && near(frame, destination) && !near(start, destination)
            ).length,
            frames: frames.length,
            glideAt,
            start : `${start.width}x${start.height}`
        }
    })
};

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

    test('a host-less workspace that frames the shell with chrome maximizes onto the SHELL — the chrome stays in sight', async ({page}) => {
        const side = tabsNodeWith(page, 'Frame');

        await tabButton(side, 'Frame').click();
        await actionButton(side, 'fa-window-maximize').click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        // Read the geometry once the presentation settled; the numbers name the failure when
        // the measurement authority is wrong (root ⇒ the pane starts at the root's gap inset,
        // above the chrome's bottom edge).
        //
        // This waited on `!style.transform`, which is not settle: it is satisfied during a play's
        // exposed frames, so the read landed on the committed rect only because the invert had not
        // arrived yet — passing BECAUSE of the exposure. With the invert installed in time the same
        // check resolves at release, mid-glide, and reads the flow slot instead.
        await waitForFlipSettled(page, '.neo-dock-maximized');

        const geometry = await page.evaluate(() => {
            const rect = id => document.querySelector(id).getBoundingClientRect(),
                  el   = rect('.neo-dock-maximized'),
                  root = rect('#dock-maximize-workspace'),
                  bar  = rect('#dock-maximize-chrome'),
                  host = document.querySelector('#dock-maximize-workspace .neo-dashboard'),
                  gap  = parseFloat(getComputedStyle(host).getPropertyValue('--dock-maximize-gap')) || 0;

            return {
                barBottom: bar.bottom,
                barTop   : bar.top,
                gap,
                paneTop  : el.top,
                rootTop  : root.top,
                shellTop : host.getBoundingClientRect().top
            }
        });

        expect(geometry.barTop, 'the chrome bar sits at the workspace root').toBeCloseTo(geometry.rootTop, 0);
        expect(geometry.shellTop, 'the projected shell mounts under the bar').toBeCloseTo(geometry.barBottom, 0);
        expect(geometry.paneTop, 'the maximized pane starts at the SHELL inset by the gap, not at the root')
            .toBeCloseTo(geometry.shellTop + geometry.gap, 0);
        expect(geometry.paneTop, 'the chrome stays uncovered').toBeGreaterThanOrEqual(geometry.barBottom - 0.5);

        await page.keyboard.press('Escape');
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0)
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

    test('Group tab activation preserves maximized presentation and identity; an outside change clears it', async ({page}) => {
        await setWorkspace(page, {groupBacked: true});
        await expect.poll(async () => (await readWorkspace(page, ['topologyGroupId']))[0]).toBeTruthy();

        const main = tabsNodeWith(page, 'Alpha');
        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await expectMaximizedCount(page, 1);
        await maximizedRectMatchesHost(page);
        const countBefore = (await readWorkspace(page, ['groupHistoryCount']))[0];
        expect(await readWorkspace(page, ['groupPaneRetained'])).toEqual([true]);
        await main.evaluate(element => window.__groupMaximizeNode = element);

        await tabButton(main, 'Beta').click();
        await expect.poll(async () => JSON.parse((await readWorkspace(page, ['docJson']))[0]).nodes['main-tabs'].activeItemId).toBe('beta');
        await expectMaximizedCount(page, 1);
        await maximizedRectMatchesHost(page);
        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual(['main-tabs']);
        expect(await main.evaluate(element => element === window.__groupMaximizeNode)).toBe(true);
        expect(await readWorkspace(page, ['groupPaneRetained'])).toEqual([true]);
        expect(await readWorkspace(page, ['groupHistoryCount'])).toEqual([countBefore + 1]);

        await setWorkspace(page, {closeItemId: 'gamma'});
        await expectMaximizedCount(page, 0);
        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual([null]);
        await expect.poll(async () => (await readWorkspace(page, ['groupHistoryCount']))[0]).toBe(countBefore + 2)
    });

    test('Group in-node closes preserve maximize until the node collapses', async ({page}) => {
        await setWorkspace(page, {groupBacked: true});
        const main = tabsNodeWith(page, 'Alpha');
        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await expectMaximizedCount(page, 1);
        const countBefore = (await readWorkspace(page, ['groupHistoryCount']))[0];

        await setWorkspace(page, {closeItemId: 'beta'});
        await expect(tabButton(main, 'Beta')).toHaveCount(0);
        await expectMaximizedCount(page, 1);
        expect(await readPlugin(page, ['maximizedNodeId'])).toEqual(['main-tabs']);

        await setWorkspace(page, {closeItemId: 'alpha'});
        await expectMaximizedCount(page, 0);
        await expect.poll(async () => (await readPlugin(page, ['maximizedNodeId']))[0]).toBeNull();
        expect(JSON.parse((await readWorkspace(page, ['docJson']))[0]).nodes['main-tabs']).toBeUndefined();
        expect(await readWorkspace(page, ['groupHistoryCount'])).toEqual([countBefore + 2])
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
        await expectIdCleared(page)
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

        // Destroy while observed tears down AT THE ADDON. The plugin's own flag is wiped with the
        // instance (so its log line reads "torn" whether or not the addon was told), which is why
        // the witness is the addon's `unregister` call in the main realm, recorded before the
        // destroy is issued.
        await setPlugin(page, {maximizedNodeId: 'main-tabs'});
        await expect.poll(async () => (await readPlugin(page, ['resizeObserved']))[0]).toBe(true);

        await page.evaluate(() => {
            const addon    = Neo.main.addon.ResizeObserver,
                  original = addon.unregister;

            window.__dockMaximizeUnregistered = [];
            addon.unregister = function(data) {
                window.__dockMaximizeUnregistered.push(`${data.componentId}:${data.id}`);
                return original.call(this, data)
            }
        });

        await page.evaluate(() => Neo.worker.App.destroyNeoInstance('dock-maximize-workspace'));

        await expect.poll(() => page.evaluate(() => window.__dockMaximizeUnregistered), {
            message: 'the owner destroy reaches the addon with the workspace id'
        }).toEqual(['dock-maximize-workspace:dock-maximize-workspace']);

        await expect.poll(async () => {
            const reply = await page.evaluate(() => Neo.worker.App.getConfigs({id: 'dock-maximize-probe', keys: ['observerLogJson']})),
                  log   = JSON.parse((reply?.data ?? reply)?.[0] || '[]');

            return log[log.length - 1]
        }).toBe('destroy:true->torn')
    });

    test('a plugin destroyed while its owner lives resets the node, and a held transition cannot touch it afterwards', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();
        await expectMaximizedCount(page, 1);
        await expect.poll(async () => (await readPlugin(page, ['resizeObserved']))[0]).toBe(true);

        // Hold the clear an outside operation starts, so a transition is in flight at destroy time.
        await setWorkspace(page, {holdMaximizeClear: true});
        await setWorkspace(page, {closeItemId: 'gamma'});
        await expect.poll(async () => JSON.parse(
            (await readWorkspace(page, ['maximizeTransitionLogJson']))[0]
        )).toEqual(['clear:start']);

        // The addon witness, as in the owner-destroy arm: the exact tuple must be released.
        await page.evaluate(() => {
            const addon    = Neo.main.addon.ResizeObserver,
                  original = addon.unregister;

            window.__dockMaximizeUnregistered = [];
            addon.unregister = function(data) {
                window.__dockMaximizeUnregistered.push(`${data.componentId}:${data.id}`);
                return original.call(this, data)
            }
        });

        await page.evaluate(() => Neo.worker.App.destroyNeoInstance('dock-maximize-plugin'));

        // The node is reset synchronously by the destroy, before the held clear ever resumes.
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);
        await page.waitForFunction(() => {
            const el = document.getElementById('dock-maximize-pane-alpha')?.closest('.neo-dashboard-dock-tabs');

            return el && !el.style.top && !el.style.width
        });
        await expect.poll(() => page.evaluate(() => window.__dockMaximizeUnregistered))
            .toEqual(['dock-maximize-workspace:dock-maximize-workspace']);

        // Release the held clear: its continuation resumes into a destroyed plugin and must not
        // mutate the owner — the fixture records the resumption, the engine path stops there.
        await setWorkspace(page, {releaseMaximizeClearCount: 1});
        await expect.poll(async () => JSON.parse(
            (await readWorkspace(page, ['maximizeTransitionLogJson']))[0]
        )).toEqual(['clear:start', 'clear:apply']);

        // The owner works on without its collaborator: a refresh projects, and the toggle is gone.
        await setWorkspace(page, {refreshCount: 1});
        await tabButton(main, 'Alpha').click();
        await expect(actionButton(main, 'fa-times')).toHaveCount(1);
        await expect(actionButton(main, 'fa-window-maximize')).toHaveCount(0);
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);
        expect(await page.evaluate(() => {
            const el = document.getElementById('dock-maximize-pane-alpha')?.closest('.neo-dashboard-dock-tabs');

            return {top: el?.style.top, width: el?.style.width, transform: el?.style.transform}
        })).toEqual({top: '', width: '', transform: ''});
        expect((await readWorkspace(page, ['isDestroyed']))[0], 'the owner lives on').toBeFalsy()
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
        // The restore glide is a REAL inverted transform on the restoring node, not only the
        // paint-order sentinel — witnessed from a per-frame log rather than by racing a poll
        // against the motion window. Two `waitForFunction` round-trips could only catch that
        // transform while an exposed window held it open for many frames; once the invert installs
        // and releases promptly, a poll lands on either side of it at random. The sampler cannot
        // miss it, and the assertion it feeds is strictly stronger than the poll it replaces.
        await startFlipSampler(page);
        await actionButton(main, 'fa-window-minimize').click();

        await page.waitForFunction(() => document.querySelector('.neo-dock-maximize-restoring') !== null, undefined, {timeout: 3000});
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);
        await page.waitForFunction(() => document.querySelector('.neo-dock-maximize-restoring') === null, undefined, {timeout: 5000});

        const restoreGlide = await page.evaluate(() => {
            window.__flipStop();

            return window.__flipFrames.some(frame =>
                frame.transform && frame.transform !== 'none' && frame.transform !== 'matrix(1, 0, 0, 1, 0, 0)'
            )
        });

        expect(restoreGlide, 'the restore rode a real inverted transform, not only the paint-order sentinel').toBe(true);
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

    /**
     * The double-take: the node paints its destination rect bare for a quarter of a second, snaps
     * back, and only then animates — so the FLIP plays *after* a visible jump.
     *
     * `DockFlip.play`'s stage-A detach poll spins up to `maxFrames` waiting for the OUTGOING
     * tree's markers to disconnect. A maximize keeps every marker node and its lineage, so that
     * predicate never falsifies and the poll burns its whole budget with the committed geometry
     * already painted and un-inverted. `hasLandedInPlace()` exists for exactly this case and its
     * docblock names this symptom — but it is gated behind a consumer-declared `geometryOnly`,
     * which the maximize play did not pass. Measured before that admission: **16 exposed frames
     * in each direction**, ~250ms.
     *
     * These two arms are separate on purpose. The apply and clear paths reach the play through
     * different code and the restore half was reported as milder, so a maximize-only witness
     * would leave it asserted by assumption.
     */
    test('maximize installs its inverse transform before any frame paints the target rect (#18027)', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();
        await startFlipSampler(page);
        await actionButton(main, 'fa-window-maximize').click();

        // Bracket the motion window by its own observable rather than a fixed sleep: the invert
        // arrives, then releases. Both bounds are the contract the :697 arm already relies on.
        await page.waitForFunction(() => {
            const el = document.querySelector('.neo-dock-maximized');

            return el && el.style.transform !== ''
        }, undefined, {timeout: 3000});

        await page.waitForFunction(() => {
            const el = document.querySelector('.neo-dock-maximized');

            return el && el.style.transform === ''
        }, undefined, {timeout: 3000});

        // Sample through to SETTLE, not merely to release. Clearing the inline transform starts
        // the transition; the node is still at First and gliding. Reading the log there makes the
        // last frame a mid-animation size, `readFlipFrames` infers that as the destination, and
        // every pre-invert frame at First is convicted — 11 phantom flashes on correct source.
        await maximizedRectMatchesHost(page);

        const {flashes, frames, glideAt} = await readFlipFrames(page);

        expect(frames, 'the sampler observed the transition').toBeGreaterThan(4);
        expect(glideAt, 'the node glided through intermediate geometry — otherwise this arm proves nothing').toBeGreaterThan(-1);
        expect(flashes, 'frames painting the maximized rect before the glide began').toBe(0)
    })

    test('restore installs its inverse transform before any frame paints the flow slot (#18027)', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-maximize').click();

        // The setup must reach a genuinely SETTLED maximize, and the order of these two waits is
        // the whole reason: on defective source the inline transform is `''` throughout the
        // exposed frames, so a lone `=== ''` check passes instantly and the restore gesture fires
        // into an in-flight FLIP. `clearPresentation` then serializes on `Maximize#play` and what
        // this arm measures is a transition confounded by the previous one — which reported a
        // clean 0 flashes on source that flashes 16. Wait for the invert to EXIST, then release.
        await page.waitForFunction(() => {
            const el = document.querySelector('.neo-dock-maximized');

            return el && el.style.transform !== ''
        }, undefined, {timeout: 3000});

        await page.waitForFunction(() => {
            const el = document.querySelector('.neo-dock-maximized');

            return el && el.style.transform === ''
        }, undefined, {timeout: 3000});

        await maximizedRectMatchesHost(page);
        await startFlipSampler(page);
        await actionButton(main, 'fa-window-minimize').click();

        await page.waitForFunction(() => {
            const el = document.querySelector('.neo-dock-maximize-restoring');

            return el && el.style.transform !== ''
        }, undefined, {timeout: 3000});

        await page.waitForFunction(() => document.querySelector('.neo-dock-maximize-restoring') === null, undefined, {timeout: 5000});

        const {flashes, frames, glideAt} = await readFlipFrames(page);

        expect(frames, 'the sampler observed the transition').toBeGreaterThan(4);
        expect(glideAt, 'the node glided through intermediate geometry — otherwise this arm proves nothing').toBeGreaterThan(-1);
        expect(flashes, 'frames painting the restored flow slot before the glide began').toBe(0);

        await expectMaximizedCount(page, 0)
    })
});
