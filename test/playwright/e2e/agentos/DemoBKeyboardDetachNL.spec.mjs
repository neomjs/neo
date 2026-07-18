import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The keyboard detach path's L3 journey on the REAL Demo B composition — a11y parity
 * for the multi-window choreography, driven the way a keyboard user drives it.
 *
 * Two witnesses:
 * 1. **The detach command:** a focused dock tab + Ctrl+Shift+D → a real OS popup vessel opens
 *    through the SAME admission machine the pointer tear-out uses, the model commits exactly
 *    once, and the aria-live region announces the outcome — with the announcement's focus claim
 *    cross-checked against the popup document's ACTUAL focus state (announced truth must equal
 *    platform truth in BOTH directions: a granted hop says "Focus moved with it", a declined one
 *    says "Focus stayed here" — headless platforms legitimately decline).
 * 2. **The cycle grammar:** Ctrl+Shift+M starts the move cycle (candidates announced with
 *    position + the host's chorded key grammar), Ctrl+Shift+ArrowRight advances it (the
 *    highlight tracks, paired hue + outline), and Escape cancels with ZERO model mutation —
 *    the outcome machine's CANCELLED terminal, keyboard leg.
 */
test.describe('AgentOS Demo B — keyboard detach + cycle grammar (Neural Link)', () => {
    test.setTimeout(120000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 900}
    });

    test('Ctrl+Shift+D detaches the focused tab to a real popup; the announcement matches platform focus truth', async ({page}) => {
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/apps/agentos/childapps/dockdemo/index.html?demo=b');

        const headers = page.locator('.neo-tab-header-toolbar .neo-tab-header-button');
        await expect(headers.first()).toBeVisible({timeout: 60000});

        // keyboard-alone discipline for the COMMAND: focus lands programmatically (no pointer
        // gesture participates), the chord does the work
        const header = headers.first();
        await header.focus();
        await expect(header).toBeFocused();

        const popupPromise = page.context().waitForEvent('page', {timeout: 30000});
        await page.keyboard.press('Control+Shift+D');

        // the admission machine opened a REAL vessel window
        const popup = await popupPromise;
        await popup.waitForLoadState('domcontentloaded');
        expect(popup.url()).toContain('popout');

        // the aria-live region announced the COMMITTED outcome
        const live = page.locator('.agentos-dockdemo-kbd-live');
        await expect(live).toContainText('detached to its own window', {timeout: 15000});

        // announced truth === platform truth, in whichever direction the platform ruled:
        // a granted hop must say so, a declined one must say so — never a mismatch
        const announcement    = await live.textContent(),
              claimedTransfer = announcement.includes('Focus moved with it'),
              actualTransfer  = await popup.evaluate(() => document.hasFocus()).catch(() => false);

        expect(claimedTransfer, `announcement "${announcement}" must match popup focus=${actualTransfer}`).toBe(actualTransfer);

        expect(pageErrors).toEqual([])
    });

    test('Ctrl+Shift+M cycles targets with announced positions + tracked highlight; Escape cancels with zero mutation', async ({page}) => {
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/apps/agentos/childapps/dockdemo/index.html?demo=b');

        const headers = page.locator('.neo-tab-header-toolbar .neo-tab-header-button');
        await expect(headers.first()).toBeVisible({timeout: 60000});

        const headerCountBefore = await headers.count(),
              header            = headers.first(),
              headerText        = await header.textContent();

        await header.focus();
        await page.keyboard.press('Control+Shift+M');

        // the cycle opened: position + candidate label + the HOST's chorded grammar announced
        const live = page.locator('.agentos-dockdemo-kbd-live');
        await expect(live).toContainText('Target 1 of', {timeout: 15000});
        await expect(live).toContainText('Ctrl+Shift+Arrow keys cycle');

        // the current candidate is highlighted — hue paired with the outline carrier
        await expect(page.locator('.agentos-kbd-target')).toHaveCount(1);

        // the chorded advance moves position AND highlight (wrap-aware: with one candidate the
        // position wraps to itself — the announcement re-renders either way)
        const candidateCount = Number((await live.textContent()).match(/Target 1 of (\d+)/)?.[1] ?? 0);
        expect(candidateCount).toBeGreaterThan(0);

        await page.keyboard.press('Control+Shift+ArrowRight');
        await expect(live).toContainText(candidateCount > 1 ? 'Target 2 of' : 'Target 1 of');
        await expect(page.locator('.agentos-kbd-target')).toHaveCount(1);

        // Escape = the CANCELLED terminal: announced, highlight cleared, ZERO model mutation
        await page.keyboard.press('Escape');
        await expect(live).toContainText('Move cancelled');
        await expect(page.locator('.agentos-kbd-target')).toHaveCount(0);

        // the tab strip is byte-identical: same headers, the focused tab still home
        await expect(headers).toHaveCount(headerCountBefore);
        await expect(headers.first()).toHaveText(headerText);

        expect(pageErrors).toEqual([])
    });
});
