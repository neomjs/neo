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
 * The bracket is captured with a subtree observer installed BEFORE the trigger: a pass can be shorter
 * than a poll interval, so sampling would miss it and read as the defect. Red-first: on `dev` no
 * producer enters the signal during a tab activation, so `seen` stays `false` and the first assertion
 * reds. The click that follows is the consumer's real act — gated on the class being absent, it lands
 * on an attached header action and the lock state flips, which a click into a detached node cannot
 * produce.
 */

const WORKSPACE = '#dock-maximize-workspace';

const tabsNodeWith = (page, tabText) => page.locator('.neo-dashboard-dock-tabs', {
    has: page.locator(`.neo-tab-header-button:has-text("${tabText}")`)
});

const tabButton    = (node, text)  => node.locator('.neo-tab-header-button', {hasText: text});
const actionButton = (node, glyph) => node.locator(`.neo-tab-header-toolbar .neo-button:has([class*="${glyph}"])`);

/**
 * Records whether any element inside the workspace carries the signal class, at install time and at
 * every class mutation in the subtree, so a bracket shorter than one poll is still seen.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const watchSignal = page => page.evaluate(selector => {
    const
        root     = document.querySelector(selector),
        log      = [],
        record   = () => log.push(!!root.querySelector('.neo-dashboard-dock-animating') || root.classList.contains('neo-dashboard-dock-animating')),
        observer = new MutationObserver(record);

    observer.observe(root, {attributes: true, attributeFilter: ['class'], subtree: true});
    record();

    globalThis.__dockSignalWatch = {log, stop: () => observer.disconnect()}
}, WORKSPACE);

const signalCarriers = page => page.locator(`${WORKSPACE} .neo-dashboard-dock-animating, ${WORKSPACE}.neo-dashboard-dock-animating`);

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Boolean[]>} The recorded presence values, first entry the state at install.
 */
const readSignal = page => page.evaluate(() => {
    const watch = globalThis.__dockSignalWatch;

    watch.stop();

    return watch.log
});

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

    const log = await readSignal(page);

    expect(log[0], 'installed at rest').toBe(false);
    expect(log, 'the signal was present inside the dock host during the pass').toContain(true);
    expect(log.at(-1), 'and absent once the pass settled').toBe(false);

    // The consumer's act: a header action clicked once the signal is absent lands on an attached node,
    // and the lock policy flips the action to its unlock presentation.
    await expect(signalCarriers(page)).toHaveCount(0);
    await actionButton(main, 'fa-lock').click();

    await expect(actionButton(main, 'fa-lock-open')).toBeVisible();
    await expect(signalCarriers(page)).toHaveCount(0)
});
