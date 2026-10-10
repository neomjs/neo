import {test, expect} from '@playwright/test';

/**
 * A reveal a pointer opens paints no user-agent focus ring around the overlay.
 *
 * The overlay root (`tabIndex: -1`) takes focus programmatically, and Chrome copies the ring decision
 * from the element focused before it. A real mouse click leaves that decision at "pointer"; a scripted
 * capture does not, because it clicks with synthetic events after focusing the tab from code. The
 * first arm is that capture. It asserts its own precondition (the root inherited `:focus-visible`),
 * since a green taken where the ring could never paint would prove nothing. The keyboard arm is the
 * control that keeps the ring for keyboard users.
 *
 * @see https://github.com/neomjs/neo/issues/19548
 */

const overlaySel = '.neo-dashboard-dock-reveal-overlay-right';
const railTabSel = '.neo-dashboard-dock-edge-rail-right .neo-dashboard-dock-rail-tab';

const readInstance = async (page, id, keys) => {
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id, keys});

    return reply?.data ?? reply
};

/** The tab focused from code with no trusted input before it, as a scripted driver does. */
const focusTabFromCode = page => page.evaluate(sel => document.querySelector(sel).focus(), railTabSel);

/** Waits for the focused reveal, then reads the overlay root's ring. */
const readOverlayRing = async page => {
    const overlay = page.locator(overlaySel);

    await expect(overlay).toBeVisible({timeout: 10000});

    const overlayId = await overlay.getAttribute('id');

    await expect.poll(async () => (await readInstance(page, overlayId, ['revealState']))[0]).toBe('revealed-focused');
    await expect.poll(() => page.evaluate(id => document.activeElement?.id === id, overlayId),
        {message: 'the overlay root holds focus'}).toBe(true);

    return page.evaluate(id => {
        const root = document.getElementById(id);

        return {focusVisible: root.matches(':focus-visible'), outlineStyle: getComputedStyle(root).outlineStyle}
    }, overlayId)
};

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-rail-origin/index.html');
    await page.waitForSelector('#dock-rail-origin-workspace', {state: 'attached'});
    await expect(page.locator(railTabSel)).toBeVisible({timeout: 10000})
});

test.describe('Neo.dashboard.dock.interaction.Rail — the focus a reveal takes and its ring', () => {
    test('a scripted pointer click after a tab focused from code paints no ring', async ({page}) => {
        await focusTabFromCode(page);

        await page.evaluate(sel => {
            const tab  = document.querySelector(sel),
                  rect = tab.getBoundingClientRect(),
                  init = {bubbles: true, button: 0, cancelable: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, detail: 1};

            tab.dispatchEvent(new MouseEvent('mousedown', {...init, buttons: 1}));
            tab.dispatchEvent(new MouseEvent('mouseup',   init));
            tab.dispatchEvent(new MouseEvent('click',     init))
        }, railTabSel);

        const ring = await readOverlayRing(page);

        expect(ring.focusVisible, 'precondition: the root inherited the tab\'s :focus-visible').toBe(true);
        expect(ring.outlineStyle).toBe('none')
    });

    test('a reveal the keyboard opens keeps the user agent\'s ring', async ({page}) => {
        await focusTabFromCode(page);
        await page.keyboard.press('Enter');

        const ring = await readOverlayRing(page);

        expect(ring.focusVisible).toBe(true);
        expect(ring.outlineStyle).not.toBe('none')
    });

    test('a real mouse click paints no ring', async ({page}) => {
        await page.locator(railTabSel).click();

        expect((await readOverlayRing(page)).outlineStyle).toBe('none')
    })
});
