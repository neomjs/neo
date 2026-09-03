import {test, expect} from '@playwright/test';

let menuId;

/**
 * @summary A two-level tree, so the cascade direction can be measured rather than the root's alone.
 * @type {Object[]}
 */
const items = [{
    id   : 'inspect',
    items: [{id: 'copy-name', text: 'Copy name'}],
    text : 'Inspect'
}];

/**
 * @summary Creates the floating root menu.
 * @param {Object} page
 * @param {Object} [config] Merged over the defaults, e.g. `{animateSpawn: true}`
 * @returns {Promise<String>}
 */
async function createMenu(page, config={}) {
    const result = await page.evaluate(instanceConfig => {
        return Neo.worker.App.createNeoInstance(instanceConfig)
    }, {
        align       : {axisLock: true, edgeAlign: 't0-b0', target: {x: 40, y: 40, width: 0, height: 0}},
        displayField: 'text',
        floating    : true,
        importPath  : '../menu/List.mjs',
        items,
        ntype       : 'menu-list',
        parentId    : 'component-test-viewport',
        ...config
    });

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`)
    }

    return result.id
}

/**
 * @summary Reports the animation contract for every mounted menu level, outermost first.
 * @param {Object} page
 * @returns {Promise<Object[]>}
 */
function animationContract(page) {
    return page.evaluate(() => [...document.querySelectorAll('.neo-menu-list')].map(node => {
        const style = getComputedStyle(node);

        return {
            aligned      : [...node.classList].find(cls => cls.startsWith('neo-aligned-')) || null,
            animateCls   : node.classList.contains('neo-animate-spawn'),
            animationName: style.animationName,
            duration     : style.animationDuration
        }
    }))
}

/**
 * @summary Opens the submenu through the real click delegate.
 * @param {Object} page
 * @returns {Promise<void>}
 */
async function openSubMenu(page) {
    await expect(page.locator('.neo-menu-list')).toHaveCount(1);
    await page.getByText('Inspect', {exact: true}).click();
    await expect(page.locator('.neo-menu-list')).toHaveCount(2)
}

test.describe('Neo.menu.List spawn animation', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        if (menuId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), menuId);
            menuId = null
        }
    });

    test('is off by default: the aligner resolves a zone, but nothing animates', async ({page}) => {
        menuId = await createMenu(page);

        await openSubMenu(page);

        const levels = await animationContract(page);

        levels.forEach(level => {
            expect(level.aligned).not.toBeNull();
            expect(level.animateCls).toBe(false);
            expect(level.animationName).toBe('none')
        })
    });

    test('animates every level, in the direction the zone search resolved', async ({page}) => {
        menuId = await createMenu(page, {animateSpawn: true});

        await openSubMenu(page);

        const byZone = Object.fromEntries((await animationContract(page)).map(level => [level.aligned, level]));

        // A menu sits on the named side of its target and enters FROM the target, so the keyframes are
        // the mirror of the zone. The submenu is the case worth asserting.
        expect(byZone['neo-aligned-right']?.animationName).toBe('neo-menu-spawn-from-left');
        expect(byZone['neo-aligned-bottom']?.animationName).toBe('neo-menu-spawn-from-top');
        expect(byZone['neo-aligned-right']?.animateCls).toBe(true)
    });

    test('a same-zone resync does not restart the entrance', async ({page}) => {
        menuId = await createMenu(page, {animateSpawn: true});
        await expect(page.locator('.neo-menu-list')).toHaveCount(1);

        // The name alone cannot witness this. A class removed and re-added around a layout read leaves
        // `animation-name` identical while DESTROYING the running animation and starting a fresh one —
        // measured directly: currentTime 949ms -> `none` with zero animations -> a different Animation
        // object at 0. So the witness is WAAPI identity plus monotonic progress, not the resolved name.
        const result = await page.evaluate(async () => {
            const
                node = document.querySelector('.neo-menu-list'),
                anim = node.getAnimations()[0];

            if (!anim) { return {error: 'no running animation to observe'} }

            // Tag the live object; a restart produces a different one and the tag will be gone.
            anim.__spawnProbe = 'original';
            anim.pause();
            anim.currentTime = 40;

            const before = {name: getComputedStyle(node).animationName, time: anim.currentTime};

            // Force the ordinary resync path: a body mutation drives `onDocumentMutation` ->
            // `syncAligns()` -> `align()`, which is where the class churn used to happen.
            const churn = document.createElement('div');

            document.body.appendChild(churn);
            await new Promise(resolve => setTimeout(resolve, 150));
            churn.remove();
            await new Promise(resolve => setTimeout(resolve, 100));

            const after = node.getAnimations()[0];

            return {
                before,
                afterName    : getComputedStyle(node).animationName,
                sameObject   : after?.__spawnProbe === 'original',
                progressKept : after ? after.currentTime >= before.time : false,
                animationLost: !after
            }
        });

        expect(result.error).toBeUndefined();
        expect(result.afterName).toBe(result.before.name);
        expect(result.animationLost).toBe(false);
        // The two that a name-only assertion cannot see:
        expect(result.sameObject).toBe(true);
        expect(result.progressKept).toBe(true)
    });

    test('a right-edge spawn flips the zone and mirrors the entrance', async ({page}) => {
        // Target hard against the right edge: the zone search cannot fit the submenu on the right, so
        // it selects the mirrored zone — and the entrance must follow the flip rather than a config.
        const width = page.viewportSize().width;

        menuId = await createMenu(page, {
            align       : {axisLock: true, edgeAlign: 't0-b0', target: {x: width - 4, y: 40, width: 0, height: 0}},
            animateSpawn: true
        });

        await openSubMenu(page);

        const zones = (await animationContract(page)).map(level => level.aligned);

        expect(zones).toContain('neo-aligned-left');

        const flipped = (await animationContract(page)).find(level => level.aligned === 'neo-aligned-left');

        expect(flipped.animationName).toBe('neo-menu-spawn-from-right')
    });

    test('a dismissed and reopened instance is cleaned up and re-arms', async ({page}) => {
        menuId = await createMenu(page, {animateSpawn: true});
        await expect(page.locator('.neo-menu-list')).toHaveCount(1);

        // Dismissal must clear the resolved zone, or a reopen would find the class already present and
        // never re-fire the entrance.
        //
        // Observed on the subject id rather than the `.neo-menu-list` locator: the reopened menu takes
        // focus, and a locator count that momentarily matches can be followed by a focus-driven
        // dismissal before the read lands. The id is the stable handle across the whole cycle.
        await page.evaluate(id => Neo.worker.App.setConfigs({id, hidden: true}), menuId);
        await expect.poll(async () => page.evaluate(id => !!document.getElementById(id), menuId)).toBe(false);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, hidden: false}), menuId);

        // The sentinel distinguishes ABSENT from UNALIGNED, because those are different failures
        // with different causes and the previous `''` returned the same value for both. Measured
        // while diagnosing the intermittency this arm carries: at the failure the node is
        // `absent` — `document.querySelectorAll('.neo-menu-list').length` is 0 — so the reopened
        // menu has left the DOM rather than arrived unaligned. Three diagnostic passes read that
        // as an alignment problem because the sentinel could not say otherwise.
        await expect.poll(async () => page.evaluate(id => {
            const node = document.getElementById(id);

            if (!node) return 'absent';

            return [...node.classList].find(cls => cls.startsWith('neo-aligned-')) ?? 'unaligned';
        }, menuId), {message: 'the reopened menu is mounted and has resolved a zone'})
            .toMatch(/^neo-aligned-/);

        // Positive match on purpose, above: `.not.toBeNull()` is satisfied by `undefined`, so against
        // an absent node it passes instantly and waits for nothing — a poll that cannot poll.

        // The entrance is polled on its OWN state, not inferred from the alignment above.
        //
        // `List.scss` keys the animation on TWO classes at once — `.neo-animate-spawn` and a
        // specific `.neo-aligned-*` — so alignment landing is necessary and not sufficient. Reading
        // `animationName` once, after a poll that gated on the other settlement, meant the read
        // could land in the window between them and see `none`. That is what made this arm fail
        // about one run in eight while the feature was working.
        //
        // Polling this value is legitimate where polling a count was not: the transition is
        // one-way. `animation-fill-mode: both` holds the end state, and `DomAccess` swaps the
        // aligned class only on a REAL zone change behind a `contains()` guard, so the name does
        // not return to `none` once resolved.
        //
        // Matched POSITIVELY against the four keyframe names the stylesheet can produce, rather
        // than `not.toBe('none')` — which any string satisfies, including a `neo-aligned-` class
        // the stylesheet has no rule for. Same reasoning as the note above, one assertion over.
        await expect.poll(async () => page.evaluate(id => {
            const node = document.getElementById(id);

            return node ? getComputedStyle(node).animationName : '';
        }, menuId), {message: 'the entrance animation is armed on the reopened instance'})
            .toMatch(/^neo-menu-spawn-from-(top|bottom|left|right)$/)
    });

    test('propagates a later animateSpawn change to an already-cached submenu, both ways', async ({page}) => {
        // Created with the flag OFF, so the submenu is cached without it — the exact case a
        // creation-time copy cannot reach.
        menuId = await createMenu(page);

        await openSubMenu(page);

        const subMenuHasCls = () => page.evaluate(() => {
            const menus = [...document.querySelectorAll('.neo-menu-list')];

            // The submenu is the level the root does not own; identify it by its resolved zone.
            return menus.find(node => node.classList.contains('neo-aligned-right'))
                ?.classList.contains('neo-animate-spawn') ?? null
        });

        expect(await subMenuHasCls()).toBe(false);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, animateSpawn: true}), menuId);
        await expect.poll(subMenuHasCls).toBe(true);

        // …and back off again: a one-way propagation would leave the cascade animating forever.
        await page.evaluate(id => Neo.worker.App.setConfigs({id, animateSpawn: false}), menuId);
        await expect.poll(subMenuHasCls).toBe(false)
    });

    test('arrow-key navigation works during the entrance window', async ({page}) => {
        // Three rows on purpose: with the single-item default, ArrowDown has nowhere to move and an
        // "an item is active" assertion passes without the key ever arriving.
        menuId = await createMenu(page, {
            animateSpawn: true,
            items       : [{id: 'one', text: 'One'}, {id: 'two', text: 'Two'}, {id: 'three', text: 'Three'}]
        });
        await expect(page.locator('.neo-menu-list')).toHaveCount(1);

        // Hold the entrance open deterministically instead of racing a 200ms animation: pause the
        // running animation early, so every key below is pressed while the menu is mid-entrance.
        const paused = await page.evaluate(() => {
            const anim = document.querySelector('.neo-menu-list')?.getAnimations()[0];

            if (!anim) { return false }

            anim.pause();
            anim.currentTime = 10;

            return true
        });

        expect(paused).toBe(true);

        // Drive the real key and observe the navigator, rather than asserting a property that merely
        // WOULD break — `offsetParent` being non-null does not prove a key reaches anything.
        const activeText = () => page.evaluate(
            () => document.querySelector('.neo-navigator-active-item')?.textContent.trim() ?? null
        );

        await page.locator('.neo-menu-list .neo-list-item').first().focus();

        const before = await activeText();

        await page.keyboard.press('ArrowDown');
        await expect.poll(activeText).not.toBe(before);

        const after = await activeText();

        // Non-vacuity: an item is already active on focus, so `exists` alone would pass without the
        // key ever arriving. The witness is that the key MOVED the navigator.
        expect(after).not.toBeNull();
        expect(after).not.toBe(before);

        // The animation must still have been mid-flight while that happened, or the window was not
        // the thing under test.
        const stillMidEntrance = await page.evaluate(() => {
            const anim = document.querySelector('.neo-menu-list')?.getAnimations()[0];

            return anim ? anim.playState === 'paused' && Number(anim.currentTime) < 200 : false
        });

        expect(stillMidEntrance).toBe(true)
    });

    test('collapses to instant under prefers-reduced-motion', async ({page}) => {
        await page.emulateMedia({reducedMotion: 'reduce'});

        menuId = await createMenu(page, {animateSpawn: true});

        await openSubMenu(page);

        (await animationContract(page)).forEach(level => {
            expect(level.animationName).not.toBe('none');
            expect(level.duration).toBe('0s')
        })
    })
});
