import {test, expect} from '@playwright/test';

/**
 * Retargeting a reveal — clicking another item of the same rail while one is open — swapped the
 * pane in one frame: the state machine follows the click without closing, so no visibility
 * boundary is crossed and no motion runs. Now the incoming content enters the way a fresh reveal
 * does, while the root stays where it is: a swap generation class alternates two names for the
 * same keyframes, which is what makes a CSS animation restart, and the root runs a held keyframe
 * of the same duration so its own end event settles the motion window as an entry's does.
 *
 * Read on a rendered dock: after the retarget the overlay is never hidden or leaving, its title is
 * the new item's, the slot carries a running entry animation again, and the swap class alternates
 * on the next retarget. The animations are read through `getAnimations()`, so a class without
 * keyframes behind it cannot pass.
 */

const
    OVERLAY = '.neo-dashboard-dock-reveal-overlay-right',
    TAB     = title => `.neo-dashboard-dock-edge-rail-right .neo-dashboard-dock-rail-tab:has-text("${title}")`;

const settleAnimations = overlay => overlay.evaluate(node =>
    Promise.all(node.getAnimations({subtree: true}).map(a => a.finished.catch(() => {}))));

const readSlotAnimations = overlay => overlay.evaluate(node => ({
    root : node.getAnimations().map(a => `${a.animationName}:${a.playState}`),
    slot : node.querySelector('.neo-dashboard-dock-reveal-pane-slot').getAnimations().map(a => `${a.animationName}:${a.playState}`),
    title: node.querySelector('.neo-dashboard-dock-reveal-title')?.textContent.trim()
}));

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-rail-retarget/index.html');
    await page.waitForSelector('#dock-rail-retarget-workspace', {state: 'attached'});
    await expect(page.locator(TAB('Alpha'))).toBeVisible({timeout: 10000});
    await expect(page.locator(TAB('Beta'))).toBeVisible()
});

test.describe('Neo.dashboard.dock.interaction.RevealOverlay — a retarget slides the incoming pane in', () => {
    test('clicking the other item of an open rail re-runs the content entry, and the next retarget alternates', async ({page}) => {
        const overlay = page.locator(OVERLAY);

        await page.locator(TAB('Alpha')).click();
        await expect(overlay).toBeVisible({timeout: 10000});
        await settleAnimations(overlay);

        expect(await overlay.evaluate(node => node.getAnimations({subtree: true}).length), 'the entry has settled').toBe(0);

        // Retarget: the overlay stays visible (never hidden, never leaving), the title follows, and
        // the slot runs the entry keyframes again under the swap generation.
        await page.locator(TAB('Beta')).click();

        await expect(overlay, 'the first retarget stamps swap generation 1').toHaveClass(/neo-dashboard-dock-reveal-overlay-swap-1/);
        await expect(overlay).not.toHaveClass(/neo-dashboard-dock-reveal-overlay-(hidden|leaving)/);

        const first = await readSlotAnimations(overlay);

        expect(first.title).toBe('Beta');
        expect(first.slot.some(name => name.startsWith('neo-dock-reveal-from-right-b:')), `the incoming pane slides in from its edge (${first.slot})`).toBe(true);
        expect(first.root.some(name => name.startsWith('neo-dock-reveal-hold-b:')), `the root holds for the same duration (${first.root})`).toBe(true);

        await settleAnimations(overlay);

        // Back to Alpha: the generation alternates so the animation restarts again.
        await page.locator(TAB('Alpha')).click();

        await expect(overlay, 'the second retarget alternates to generation 2').toHaveClass(/neo-dashboard-dock-reveal-overlay-swap-2/);
        await expect(overlay).not.toHaveClass(/neo-dashboard-dock-reveal-overlay-swap-1/);

        const second = await readSlotAnimations(overlay);

        expect(second.title).toBe('Alpha');
        expect(second.slot.some(name => name.startsWith('neo-dock-reveal-from-right:')), `the alternate generation reuses the entry's own keyframes (${second.slot})`).toBe(true);

        // Dismissal clears the generation so the next entry runs the entry rules, not a swap.
        await page.keyboard.press('Escape');
        await expect(overlay).toHaveClass(/neo-dashboard-dock-reveal-overlay-hidden/, {timeout: 10000});
        await expect(overlay).not.toHaveClass(/neo-dashboard-dock-reveal-overlay-swap-/)
    });

    /**
     * The arm above proves each generation RUNS an animation. That is not enough, and the gap is
     * the reason this one exists: the two generations exist only so the `animation-name` differs —
     * a CSS animation restarts on nothing else — while the geometry they animate must stay equal.
     * Emitted from one SCSS declaration they cannot diverge; maintained as twins they could, and
     * the symptom is a rendering glitch nobody would read as a CSS error: alternating retargets
     * travelling different distances, wrong on every second interaction. Presence is identical in
     * both worlds, so only a comparison of the two generations' own keyframes discriminates.
     *
     * Read from the running animation rather than the sheet, so what is compared is what the
     * browser will actually interpolate — `100cqw` resolved against the live container, on the same
     * element at the same size for both generations.
     */
    test('the running generations differ in NAME and agree in GEOMETRY on the rail under test', async ({page}) => {
        const
            overlay = page.locator(OVERLAY),
            // The slot's own running entry animation, with its keyframes as the browser computed
            // them. Null rather than a throw if nothing runs — an absent animation is a failure the
            // assertions below should report, not a stack trace here.
            readGeometry = () => overlay.evaluate(node => {
                const
                    slot = node.querySelector('.neo-dashboard-dock-reveal-pane-slot'),
                    anim = slot?.getAnimations().find(a => a.animationName?.startsWith('neo-dock-reveal-from-'));

                return anim ? {
                    name     : anim.animationName,
                    keyframes: anim.effect.getKeyframes().map(({offset, transform}) => ({offset, transform}))
                } : null
            });

        await page.locator(TAB('Alpha')).click();
        await expect(overlay).toBeVisible({timeout: 10000});
        await settleAnimations(overlay);

        await page.locator(TAB('Beta')).click();
        await expect(overlay).toHaveClass(/neo-dashboard-dock-reveal-overlay-swap-1/);

        const generationOne = await readGeometry();

        await settleAnimations(overlay);

        await page.locator(TAB('Alpha')).click();
        await expect(overlay).toHaveClass(/neo-dashboard-dock-reveal-overlay-swap-2/);

        const generationTwo = await readGeometry();

        // Non-vacuity: a null read on either side would make the equality below trivially true.
        expect(generationOne, 'generation 1 must actually be animating the slot').not.toBeNull();
        expect(generationTwo, 'generation 2 must actually be animating the slot').not.toBeNull();
        expect(generationOne.keyframes.length, 'and the keyframes must have been readable').toBeGreaterThan(0);

        // The mechanism: different names are the ONLY reason the animation restarts.
        expect(generationTwo.name, 'the generations must name different keyframes, or nothing restarts')
            .not.toBe(generationOne.name);

        // The invariant: and yet they must travel identically.
        expect(generationTwo.keyframes,
            `the two generations must animate the same geometry — ${generationOne.name} vs ${generationTwo.name}`)
            .toEqual(generationOne.keyframes)
    });

    /**
     * The arm above reads what the browser will actually interpolate, which is the stronger claim —
     * but it can only reach the ONE edge this fixture's rail uses. A hand-written `from-top-b` with
     * different geometry would emit, build, and pass it. The `@each` is what makes that structurally
     * impossible; this arm is the backstop for a loop someone later unwinds in part, so it has to
     * cover all four pairs rather than the one on screen.
     *
     * Read from the live stylesheets, so what is compared is the SHIPPED CSS — the same artifact the
     * browser resolves — rather than the SCSS source, which is the thing under suspicion.
     */
    test('every generation pair is emitted identically — the backstop covers all four edges, not only the rail under test', async ({page}) => {
        const pairs = await page.evaluate(() => {
            const bodies = {};

            for (const sheet of document.styleSheets) {
                let rules;

                // A cross-origin sheet throws on access and is never ours.
                try { rules = sheet.cssRules } catch { continue }

                for (const rule of rules ?? []) {
                    if (rule.type === CSSRule.KEYFRAMES_RULE && rule.name.startsWith('neo-dock-reveal-')) {
                        // Last definition wins in CSS, so a later override must overwrite here too —
                        // otherwise a drifted twin appended after the loop would be invisible.
                        bodies[rule.name] = [...rule.cssRules].map(frame => `${frame.keyText}{${frame.style.cssText}}`).join('')
                    }
                }
            }

            return [
                ...['left', 'right', 'top', 'bottom'].map(edge => ({
                    pair: edge,
                    base: bodies[`neo-dock-reveal-from-${edge}`],
                    twin: bodies[`neo-dock-reveal-from-${edge}-b`]
                })),
                {pair: 'hold', base: bodies['neo-dock-reveal-hold-a'], twin: bodies['neo-dock-reveal-hold-b']}
            ]
        });

        // Non-vacuity: an empty or partial read would make every equality below trivially true.
        expect(pairs, 'four directional pairs plus the hold pair').toHaveLength(5);

        for (const {pair, base, twin} of pairs) {
            expect(base, `the ${pair} base keyframe must exist in the shipped CSS`).toBeTruthy();
            expect(twin, `the ${pair} twin keyframe must exist in the shipped CSS`).toBeTruthy()
        }

        for (const {pair, base, twin} of pairs) {
            expect(twin, `the ${pair} generations must be emitted identically`).toBe(base)
        }
    })
});
