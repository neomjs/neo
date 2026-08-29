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
        await expect.poll(async () => page.evaluate(id => {
            const node = document.getElementById(id);

            return node ? [...node.classList].find(cls => cls.startsWith('neo-aligned-')) ?? '' : '';
        }, menuId)).toMatch(/^neo-aligned-/);

        // Positive match on purpose, above: `.not.toBeNull()` is satisfied by `undefined`, so against
        // an absent node it passes instantly and waits for nothing — a poll that cannot poll.
        const animationName = await page.evaluate(
            id => getComputedStyle(document.getElementById(id)).animationName, menuId
        );

        expect(animationName).not.toBe('none')
    });

    test('arrow-key navigation reaches items during the entrance window', async ({page}) => {
        menuId = await createMenu(page, {animateSpawn: true});
        await expect(page.locator('.neo-menu-list')).toHaveCount(1);

        // The entrance animates opacity and `translate`; neither removes an element from the
        // navigator's `node.offsetParent && node.matches(selector)` filter. An implementation reaching
        // for `display` or `visibility` would drop every item out of keyboard reach for its duration,
        // which is exactly the regression this pins.
        const reachable = await page.evaluate(() => {
            const node = document.querySelector('.neo-menu-list');

            return [...node.querySelectorAll('.neo-list-item')]
                .every(item => item.offsetParent !== null)
        });

        expect(reachable).toBe(true)
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
