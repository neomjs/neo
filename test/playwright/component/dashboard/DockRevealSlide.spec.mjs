import {test, expect} from '@playwright/test';

/**
 * The auto-hide reveal's entry motion, read from the rendered overlay's own animations on all
 * four edges (the `dock-rail-origin` fixture rails one item per edge):
 *
 * - the overlay ROOT fades in where it will stay (`neo-dock-reveal-fade`, from opacity 0) and
 *   never moves, so its box never overlaps the rail strip mid-entry — the strip stays clickable
 *   through the whole entry;
 * - the root's CONTENT (header + pane slot) slides in from the strip side as ONE panel: both
 *   children travel the overlay's own extent along the edge's axis (`±100cqw` / `±100cqh`, the
 *   root being their size container), so paused at the same progress they have moved the same
 *   distance — on the block axis too, where a percentage translate would have landed the
 *   one-toolbar-tall header long before the slot;
 * - every animation reads the reveal token (one duration, the panel tier), and reduced motion
 *   collapses it to `0s` at the token layer.
 *
 * Declarations are read through the Web Animations API (`getAnimations()` + `getKeyframes()`),
 * which does not race a 280ms animation; the travel equality is read on animations PAUSED at a
 * fixed progress, against the settled boxes after `finish()`.
 */

const EDGES = ['left', 'right', 'top', 'bottom'];

const AXIS = {left: 'x', right: 'x', top: 'y', bottom: 'y'};

const overlayFor = edge => `.neo-dashboard-dock-reveal-overlay-${edge}`;

const railTabFor = edge => `.neo-dashboard-dock-edge-rail-${edge} .neo-dashboard-dock-rail-tab`;

/** Waits until the overlay is displayed, pauses its entry at a fixed progress, and reads it. */
const readEntryMotion = (page, edge) => page.evaluate(({edge, overlaySelector, railSelector}) => new Promise(resolve => {
    const check = () => {
        const root = document.querySelector(overlaySelector);

        if (!root || getComputedStyle(root).display === 'none') {
            requestAnimationFrame(check);
            return
        }

        const
            rail     = document.querySelector(railSelector),
            header   = root.querySelector('.neo-dashboard-dock-reveal-header'),
            slot     = root.querySelector('.neo-dashboard-dock-reveal-pane-slot'),
            all      = root.getAnimations({subtree: true}),
            describe = element => (element?.getAnimations() ?? []).map(animation => ({
                name    : animation.animationName,
                duration: animation.effect.getTiming().duration,
                from    : animation.effect.getKeyframes()[0]
            })),
            rect     = element => element ? element.getBoundingClientRect().toJSON() : null,
            // Container-query units resolve against the size container's CONTENT box. The root is
            // `box-sizing: border-box` and carries the reveal chrome floor's 1px border, so its
            // bounding rect (the border box) is 2px wider than the box `cqw` reads — the yardstick
            // for the declared travel has to be the content box, or every chrome the root gains
            // reads as travel drift.
            content  = element => {
                const cs = getComputedStyle(element), px = v => parseFloat(cs[v]) || 0, box = element.getBoundingClientRect();

                return {
                    width : box.width  - px('borderLeftWidth') - px('borderRightWidth')  - px('paddingLeft') - px('paddingRight'),
                    height: box.height - px('borderTopWidth')  - px('borderBottomWidth') - px('paddingTop')  - px('paddingBottom')
                }
            };

        // Read the declarations while the animations are live — a finished CSS animation leaves
        // `getAnimations()` — then freeze every entry animation at the same progress, read the
        // mid-flight boxes, finish them all and read the settled boxes: the travel is the difference.
        const declared = {root: describe(root), header: describe(header), slot: describe(slot)};

        all.forEach(animation => {
            animation.pause();
            animation.currentTime = 140
        });

        const midFlight = {header: rect(header), slot: rect(slot), root: rect(root)};

        all.forEach(animation => animation.finish());

        resolve({
            declared,
            midFlight,
            settled    : {header: rect(header), slot: rect(slot), root: rect(root)},
            rootContent: content(root),
            rail       : rect(rail),
            styles     : {
                rootContainerType: getComputedStyle(root).containerType,
                rootOpacity      : getComputedStyle(root).opacity,
                slotTransform    : getComputedStyle(slot).transform
            }
        })
    };

    check()
}), {edge, overlaySelector: overlayFor(edge), railSelector: `.neo-dashboard-dock-edge-rail-${edge}`});

const intersects = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const dismiss = async (page, edge) => {
    await page.keyboard.press('Escape');
    await expect(page.locator(overlayFor(edge))).toBeHidden({timeout: 10000})
};

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-rail-origin/index.html');
    await page.waitForSelector('#dock-rail-origin-workspace', {state: 'attached'});

    for (const edge of EDGES) {
        await expect(page.locator(`.neo-dashboard-dock-edge-rail-${edge}`)).toBeVisible({timeout: 10000})
    }
});

test.describe('dock reveal entry motion', () => {
    test('on every edge the root fades in place and its content enters from the strip side as one panel, on the reveal token', async ({page}) => {
        for (const edge of EDGES) {
            const
                axis      = AXIS[edge],
                extent    = axis === 'x' ? 'width' : 'height',
                unit      = axis === 'x' ? 'cqw' : 'cqh',
                sign      = (edge === 'left' || edge === 'top') ? '-' : '',
                translate = axis === 'x' ? 'translateX' : 'translateY';

            await page.locator(railTabFor(edge)).first().click();

            const motion = await readEntryMotion(page, edge);

            // The root: a fade from nothing, no transform — born where it settles.
            expect(motion.declared.root, `${edge}: the root carries one animation`).toHaveLength(1);
            expect(motion.declared.root[0].name).toBe('neo-dock-reveal-fade');
            expect(motion.declared.root[0].duration, `${edge}: the reveal token resolves to the panel tier`).toBe(280);
            expect(motion.declared.root[0].from.opacity).toBe('0');
            expect(motion.declared.root[0].from.transform, `${edge}: the root never moves`).toBeUndefined();
            expect(motion.styles.rootContainerType, `${edge}: the root is the children's size container`).toBe('size');

            // The content: the owning edge's keyframe, the root's extent as its distance, the same
            // token. `getKeyframes()` hands back the container-query length already resolved
            // (`translateX(-318px)` for a 320px overlay with a 1px border each side), which is the
            // assertion that matters: the declared travel IS the root's CONTENT extent along the axis
            // — the box `cqw` / `cqh` read — signed toward the strip; a percentage would come back
            // unresolved (`-100%`), because it is not a length of the root.
            const rootExtent = motion.rootContent[extent];

            for (const part of ['header', 'slot']) {
                expect(motion.declared[part], `${edge}: ${part} carries the slide`).toHaveLength(1);
                expect(motion.declared[part][0].name).toBe(`neo-dock-reveal-from-${edge}`);
                expect(motion.declared[part][0].duration).toBe(280);

                const
                    from   = motion.declared[part][0].from.transform,
                    match  = new RegExp(`^${translate}\\((-?[0-9.]+)px\\)$`).exec(from ?? ''),
                    length = match ? Number(match[1]) : NaN;

                expect(match, `${edge}: ${part} declares a resolved length toward the strip (got "${from}", expected ${translate}(${sign}<root ${extent}>px) — the ${unit} unit resolves against the root)`).toBeTruthy();
                expect(Math.sign(length), `${edge}: ${part} starts on the strip side`).toBe(sign === '-' ? -1 : 1);
                expect(Math.abs(Math.abs(length) - rootExtent), `${edge}: ${part} travels the root's ${extent} (${rootExtent}px), not its own`).toBeLessThanOrEqual(1)
            }

            // One panel: paused at the same progress, header and slot have travelled the same
            // distance along the edge's axis, and that distance is a real fraction of the root.
            const
                travel   = part => Math.abs(motion.midFlight[part][axis] - motion.settled[part][axis]),
                headerMv = travel('header'),
                slotMv   = travel('slot');

            expect(headerMv, `${edge}: the header is mid-flight`).toBeGreaterThan(1);
            expect(slotMv, `${edge}: the slot is mid-flight`).toBeGreaterThan(1);
            expect(Math.abs(headerMv - slotMv), `${edge}: header and slot travel as one panel (header ${headerMv}px, slot ${slotMv}px)`).toBeLessThanOrEqual(1);
            expect(slotMv, `${edge}: the travel is bounded by the root's ${extent}`).toBeLessThanOrEqual(motion.settled.root[extent] + 1);

            // The strip stays clear: the root's box — the only box that can intercept a pointer —
            // does not overlap the rail mid-flight, and it does not move.
            expect(motion.rail, `${edge}: the strip is rendered`).toBeTruthy();
            expect(intersects(motion.midFlight.root, motion.rail), `${edge}: the overlay box never covers its strip`).toBe(false);
            expect(motion.midFlight.root, `${edge}: the root's box is the settled box`).toEqual(motion.settled.root);

            // Settled: content at rest, root opaque.
            expect(motion.styles.rootOpacity).toBe('1');
            expect(motion.styles.slotTransform).toBe('none');

            await dismiss(page, edge)
        }
    });

    test('reduced motion collapses the reveal at the token layer', async ({page}) => {
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.reload();
        await expect(page.locator('.neo-dashboard-dock-edge-rail-right')).toBeVisible({timeout: 10000});

        await page.locator(railTabFor('right')).first().click();
        await expect(page.locator(overlayFor('right'))).toBeVisible();

        const durations = await page.evaluate(overlaySelector => {
            const root = document.querySelector(overlaySelector);

            return {
                root  : getComputedStyle(root).animationDuration,
                header: getComputedStyle(root.querySelector('.neo-dashboard-dock-reveal-header')).animationDuration,
                slot  : getComputedStyle(root.querySelector('.neo-dashboard-dock-reveal-pane-slot')).animationDuration
            }
        }, overlayFor('right'));

        expect(durations, 'no per-site check: the token collapsed all three').toEqual({root: '0s', header: '0s', slot: '0s'})
    });
});
