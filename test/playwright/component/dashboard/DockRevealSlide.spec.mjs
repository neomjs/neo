import {test, expect} from '@playwright/test';

/**
 * The auto-hide reveal's entry motion, read from the rendered overlay's own animations:
 *
 * - the overlay ROOT fades in where it will stay (`neo-dock-reveal-fade`, from opacity 0) and
 *   never moves, so its box never overlaps the rail strip mid-entry — the strip stays clickable
 *   through the whole entry;
 * - the root's CONTENT (header + pane slot) slides in a full box-width from the strip side
 *   (`neo-dock-reveal-from-<edge>`, from `translate*(±100%)`), clipped by the root;
 * - every animation reads the reveal token (one duration, the panel tier), and reduced motion
 *   collapses it to `0s` at the token layer.
 *
 * Keyframes are asserted through the Web Animations API (`getAnimations()` + `getKeyframes()`),
 * which reads the stylesheet's declared motion without racing a 280ms animation: the facts are the
 * same on the first frame and after settle. The fixture's edge zone rails its `Railed` item on the
 * right edge, so the right-edge branch is the one exercised; the other three edges differ only by
 * the keyframe name the per-edge cls selects.
 */

const OVERLAY = '.neo-dashboard-dock-reveal-overlay';

/** Waits until the overlay is displayed, then reads its motion facts in the same frame. */
const readEntryMotion = page => page.evaluate(overlaySelector => new Promise(resolve => {
    const check = () => {
        const root = document.querySelector(overlaySelector);

        if (!root || getComputedStyle(root).display === 'none') {
            requestAnimationFrame(check);
            return
        }

        const
            rail     = document.querySelector('.neo-dashboard-dock-edge-rail-right'),
            slot     = root.querySelector('.neo-dashboard-dock-reveal-pane-slot'),
            header   = root.querySelector('.neo-dashboard-dock-reveal-header'),
            describe = element => (element?.getAnimations() ?? []).map(animation => ({
                name    : animation.animationName,
                duration: animation.effect.getTiming().duration,
                from    : animation.effect.getKeyframes()[0]
            })),
            rect     = element => element ? element.getBoundingClientRect().toJSON() : null;

        resolve({
            root    : describe(root),
            header  : describe(header),
            slot    : describe(slot),
            rootRect: rect(root),
            railRect: rect(rail),
            edgeCls : [...root.classList].filter(cls => /-(left|right|top|bottom)$/.test(cls))
        })
    };

    check()
}), OVERLAY);

const intersects = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-popout/index.html');
    await page.waitForSelector('#dock-popout-workspace', {state: 'attached'});
    await page.waitForSelector('.neo-dashboard-dock-rail-tab', {state: 'visible'})
});

test.describe('dock reveal entry motion', () => {
    test('the root fades in place while its content slides in from the strip side, on the reveal token', async ({page}) => {
        await page.locator('.neo-dashboard-dock-rail-tab', {hasText: 'Railed'}).click();

        const motion = await readEntryMotion(page);

        expect(motion.edgeCls, 'the rail stamped the right edge on the overlay').toEqual(['neo-dashboard-dock-reveal-overlay-right']);

        // The root: a fade from nothing, no transform — it is born where it settles.
        expect(motion.root).toHaveLength(1);
        expect(motion.root[0].name).toBe('neo-dock-reveal-fade');
        expect(motion.root[0].duration, 'the reveal token resolves to the panel tier').toBe(280);
        expect(motion.root[0].from.opacity).toBe('0');
        expect(motion.root[0].from.transform, 'the root never moves').toBeUndefined();

        // The content: a full box-width from the right, on the same token.
        for (const part of ['header', 'slot']) {
            expect(motion[part], `${part} carries the slide`).toHaveLength(1);
            expect(motion[part][0].name).toBe('neo-dock-reveal-from-right');
            expect(motion[part][0].duration).toBe(280);
            expect(motion[part][0].from.transform).toBe('translateX(100%)')
        }

        // The strip stays clear: the root's box, which is the only box that can intercept a
        // pointer, does not overlap the rail on the first displayed frame.
        expect(motion.railRect, 'the right rail strip is rendered').toBeTruthy();
        expect(intersects(motion.rootRect, motion.railRect), 'the overlay box never covers its strip').toBe(false);

        // Settle: content at rest, root opaque, same rects.
        const settled = await page.evaluate(overlaySelector => {
            const root = document.querySelector(overlaySelector);

            return Promise.all(root.getAnimations({subtree: true}).map(animation => animation.finished)).then(() => ({
                rootOpacity  : getComputedStyle(root).opacity,
                slotTransform: getComputedStyle(root.querySelector('.neo-dashboard-dock-reveal-pane-slot')).transform,
                rootRect     : root.getBoundingClientRect().toJSON()
            }))
        }, OVERLAY);

        expect(settled.rootOpacity).toBe('1');
        expect(settled.slotTransform).toBe('none');
        expect(settled.rootRect).toEqual(motion.rootRect)
    });

    test('reduced motion collapses the reveal at the token layer', async ({page}) => {
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.reload();
        await page.waitForSelector('.neo-dashboard-dock-rail-tab', {state: 'visible'});

        await page.locator('.neo-dashboard-dock-rail-tab', {hasText: 'Railed'}).click();

        await expect(page.locator(OVERLAY)).toBeVisible();

        const durations = await page.evaluate(overlaySelector => {
            const root = document.querySelector(overlaySelector);

            return {
                root: getComputedStyle(root).animationDuration,
                slot: getComputedStyle(root.querySelector('.neo-dashboard-dock-reveal-pane-slot')).animationDuration
            }
        }, OVERLAY);

        expect(durations, 'no per-site check: the token collapsed both').toEqual({root: '0s', slot: '0s'})
    });
});
