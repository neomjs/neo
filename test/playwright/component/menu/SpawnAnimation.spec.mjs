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
 *
 * `align.target` is a zero-sized point on the left of the viewport, so the submenu has room to the
 * right and the zone search resolves `right` — the direction the tests below assert against.
 * @param {Object} page
 * @param {Object} [config]
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
 *
 * Deliberately reads the resolved CSS contract — classes plus computed `animation-name` and duration —
 * rather than sampling a visual state mid-flight. A frame grabbed during a 200ms entrance is a race;
 * the contract is not.
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
            duration     : style.animationDuration,
            initial      : node.classList.contains('neo-align-initial')
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

    test('is off by default: the aligner marks the spawn, but nothing animates', async ({page}) => {
        menuId = await createMenu(page);

        await openSubMenu(page);

        const levels = await animationContract(page);

        // The marker and the resolved zone are unconditional — they are the aligner's, and other
        // consumers (the box-shadow edge) already depend on them.
        levels.forEach(level => {
            expect(level.initial).toBe(true);
            expect(level.aligned).not.toBeNull()
        });

        // The opt-in is what gates motion. Default off must leave the rendered result untouched.
        levels.forEach(level => {
            expect(level.animateCls).toBe(false);
            expect(level.animationName).toBe('none')
        })
    });

    test('animates every level, in the direction the zone search resolved', async ({page}) => {
        menuId = await createMenu(page, {animateSpawn: true});

        await openSubMenu(page);

        const byZone = Object.fromEntries((await animationContract(page)).map(level => [level.aligned, level]));

        // A menu sits on the named side of its target and enters FROM the target, so the keyframes are
        // the mirror of the zone. The submenu is the case worth asserting: it resolves `right`, so it
        // slides in from the left and reads as emerging from the item that opened it.
        expect(byZone['neo-aligned-right']?.animationName).toBe('neo-menu-spawn-from-left');
        expect(byZone['neo-aligned-bottom']?.animationName).toBe('neo-menu-spawn-from-top');

        // The submenu is created by showSubMenu(), not by the caller — without explicit propagation it
        // would stay unanimated while its root moved, inverting the effect the feature exists for.
        expect(byZone['neo-aligned-right']?.animateCls).toBe(true)
    });

    test('the entrance survives the DOM churn that opening a submenu causes', async ({page}) => {
        menuId = await createMenu(page, {animateSpawn: true});

        await openSubMenu(page);

        // `onDocumentMutation` resyncs every aligned subject on ordinary body churn, and opening a
        // submenu is enough to trigger it. A marker cleared per-align would be stripped milliseconds
        // into the root's entrance and cancel it, so the root must still carry both the marker and a
        // live animation name after its child has mounted.
        const root = (await animationContract(page)).find(level => level.aligned === 'neo-aligned-bottom');

        expect(root.initial).toBe(true);
        expect(root.animationName).toBe('neo-menu-spawn-from-top')
    });

    test('collapses to instant under prefers-reduced-motion', async ({page}) => {
        await page.emulateMedia({reducedMotion: 'reduce'});

        menuId = await createMenu(page, {animateSpawn: true});

        await openSubMenu(page);

        // The durations come from the `_motion.scss` vocabulary, which collapses every tier to 0ms
        // under reduced motion. Asserting the resolved duration exercises that contract instead of
        // trusting that a token was used.
        (await animationContract(page)).forEach(level => {
            expect(level.animationName).not.toBe('none');
            expect(level.duration).toBe('0s')
        })
    })
});
