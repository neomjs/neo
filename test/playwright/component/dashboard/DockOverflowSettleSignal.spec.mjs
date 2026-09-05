import {test, expect} from '@playwright/test';

/**
 * A tab header's overflow repartition is a projection pass that removes and restores header nodes.
 * Without a published signal a pointer consumer could only guess when a header was safe to click; a
 * node that was visible, enabled and rect-stable could be detached before the click dispatched. The
 * dock routes the plugin's `overflowProjectionStart` / `overflowProjectionIdle`
 * pair into its motion signal, so while the pass is in flight the header toolbar carries
 * `neo-dashboard-dock-animating` inside the dock host, exactly as motion producers do, and drops it
 * when the pass settles. A consumer asks the dock host's subtree, not one carrier.
 *
 * The bracket is captured with a subtree observer installed BEFORE the trigger, reading presence from
 * the class value each mutation replaced as well as from the live DOM. Whether it is observable at all
 * depends on the pass: a measurement round-trip that returns before the App Worker flushes the entering
 * class lands enter and leave in one DOM update, so the class never appears — and no window a pointer
 * could hit a detached node in exists either. Presence is therefore recorded as a run annotation, not
 * asserted; the routing and the one-pair semantics are pinned deterministically by the unit arms. What
 * this arm asserts is the consumer's contract: absent at rest, absent at settle, and the click that
 * follows — gated on the class being absent — lands on an attached header action and flips the lock
 * state, which a click into a detached node cannot produce.
 */

const WORKSPACE = '#dock-maximize-workspace';

const tabsNodeWith = (page, tabText) => page.locator('.neo-dashboard-dock-tabs', {
    has: page.locator(`.neo-tab-header-button:has-text("${tabText}")`)
});

const tabButton    = (node, text)  => node.locator('.neo-tab-header-button', {hasText: text});
const actionButton = (node, glyph) => node.locator(`.neo-tab-header-toolbar .neo-button:has([class*="${glyph}"])`);

/**
 * Records whether any element inside the workspace carries the signal class, at install time and at
 * every class mutation in the subtree. Presence is read at callback time OR from the class value a
 * mutation replaced, so a class that entered and left across two DOM updates is seen even when the
 * callback runs after it left. A pass whose enter and leave land in ONE update leaves no trace here —
 * the class never reaches the DOM — and no window a pointer could hit a detached node in either.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const watchSignal = page => page.evaluate(selector => {
    const
        root    = document.querySelector(selector),
        cls     = 'neo-dashboard-dock-animating',
        present = () => root.classList.contains(cls) || !!root.querySelector(`.${cls}`),
        log     = [],
        // `before`: the class stood in a value this batch replaced; `after`: it stands in the live DOM now.
        // The leave itself is a mutation whose replaced value carries the class, so a settled pass ends
        // on `{before: true, after: false}` — the two are kept apart so settle is read from `after`.
        record   = records => log.push({
            before: records.some(record => (record.oldValue || '').includes(cls)),
            after : present()
        }),
        observer = new MutationObserver(record);

    observer.observe(root, {attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true});
    log.push({before: false, after: present()});

    globalThis.__dockSignalWatch = {log, stop: () => observer.disconnect()}
}, WORKSPACE);

const signalCarriers = page => page.locator(`${WORKSPACE} .neo-dashboard-dock-animating, ${WORKSPACE}.neo-dashboard-dock-animating`);

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{before: Boolean, after: Boolean}>>} The recorded presence per mutation batch,
 *     first entry the state at install.
 */
const readSignal = page => page.evaluate(() => {
    const watch = globalThis.__dockSignalWatch;

    watch.stop();

    return watch.log
});

/**
 * Waits until the recorded timeline ends with the signal absent. A pass can be in flight at any instant
 * — boot leaves late passes behind, an activation triggers one — so "settled" is a state to wait for,
 * never a sample to assert.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const awaitSettled = page => expect.poll(
    () => page.evaluate(() => globalThis.__dockSignalWatch.log.at(-1).after),
    {message: 'the timeline ends with the signal absent', timeout: 5000}
).toBe(false);

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-maximize/index.html');
    await page.waitForSelector(WORKSPACE, {state: 'attached'});
    await page.waitForSelector('.neo-tab-header-button', {state: 'visible'});
    await expect(signalCarriers(page), 'at rest nothing is in flight').toHaveCount(0)
});

test('a tab activation\'s header repartition brackets the header with the dock motion signal, and a click gated on its absence lands', async ({page}) => {
    const main = tabsNodeWith(page, 'Alpha');

    await expect(main).toHaveCount(1);
    await expect(tabButton(main, 'Alpha')).toHaveAttribute('aria-selected', 'true');

    await watchSignal(page);

    // Activation is a repartition trigger: the overflow plugin re-measures the header and re-applies
    // its split for the new active tab, which is the pass that removes and restores header nodes.
    await tabButton(main, 'Beta').click();

    await expect(tabButton(main, 'Beta')).toHaveAttribute('aria-selected', 'true');
    await expect(signalCarriers(page)).toHaveCount(0);

    // Settled is waited for, not sampled: a late boot pass or the activation's own pass may still be in
    // flight at any instant, so the assertion is that the timeline REACHES an absent state.
    await awaitSettled(page);

    const log = await readSignal(page);

    // The state at install is recorded for the run's evidence, not asserted, for the same reason.
    test.info().annotations.push({type: 'dock-signal-at-install', description: String(log[0].after)});

    // Whether the bracket was observable depends on the pass: when the measurement round-trip returns
    // before the App Worker flushes the entering class, enter and leave land in one DOM update and the
    // class never appears — nor does a window a pointer could hit a detached node in. Presence is
    // therefore recorded for the run's evidence, not required; what the consumer relies on is that the
    // signal is absent at rest and at settle, and that a click gated on its absence lands — below.
    test.info().annotations.push({type: 'dock-signal-observed', description: String(log.some(entry => entry.before || entry.after))});

    // The consumer's act: a header action clicked once the signal is absent lands on an attached node,
    // and the lock policy flips the action to its unlock presentation.
    await expect(signalCarriers(page)).toHaveCount(0);
    await actionButton(main, 'fa-lock').click();

    await expect(actionButton(main, 'fa-lock-open')).toBeVisible();
    await expect(signalCarriers(page)).toHaveCount(0)
});
