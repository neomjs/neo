import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Neo.layout.Cube, asserted from what renders rather than what it wrote.
 *
 * The ticket that asked for this file states the trap plainly: a unit test on a
 * CSS-3D layout can only assert the values the layout just wrote, which pins the
 * implementation against itself and passes happily while the cube renders inside
 * out. So the central assertion here is a hit test. `elementFromPoint` at the
 * cube's centre returns whatever face is actually on top, and each of the six
 * faces is required to come back as itself. Reading `--rot-x` back would agree
 * with a cube whose faces are all stacked the same way.
 *
 * The fixture is `component/apps/layout-cube/`, whose three faces carry the face
 * name in their class through `applyChildAttributes`.
 */

const FACES = ['front', 'back', 'left', 'right', 'top', 'bottom'];

/** The fixture's container id, declared in the app and stable across runs. */
const CONTAINER_ID = 'layout-cube-under-test';

/**
 * @summary The six rotations the layout's own `static faces` table encodes.
 * @type {Object}
 */
const EXPECTED_ROTATIONS = {
    front : ['0deg',   '0deg'  ],
    back  : ['0deg',   '180deg'],
    left  : ['0deg',   '90deg' ],
    right : ['0deg',   '270deg'],
    top   : ['270deg', '0deg'  ],
    bottom: ['90deg',  '0deg'  ]
};

/**
 * @summary The axis group `applyChildAttributes` assigns by child index.
 * @type {Object}
 */
const EXPECTED_AXIS = {
    front : 'neo-face-z',
    back  : 'neo-face-z',
    left  : 'neo-face-x',
    right : 'neo-face-x',
    top   : 'neo-face-y',
    bottom: 'neo-face-y'
};

/**
 * @summary Points a spec at the fixture and waits for the cube to settle.
 * @param {Object} page
 * @returns {Promise<Object>} the cube's centre in viewport coordinates
 */
async function openFixture(page) {
    await page.goto('test/playwright/component/apps/layout-cube/index.html');
    await expect(page.locator('.neo-layout-cube')).toBeAttached({timeout: 15000});
    // The container carries `neo-animate`, so a face change transitions rather
    // than snapping. Sampling mid-transition measures the animator, not the
    // layout, so every read below waits for the rotation to stop moving.
    await waitForCubeToSettle(page);
    return readCentre(page);
}

/**
 * @summary The cube's centre in viewport coordinates.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
function readCentre(page) {
    return page.evaluate(() => {
        const r = document.querySelector('.neo-layout-cube').getBoundingClientRect();
        return {cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2)};
    });
}

/**
 * @summary Turns the cube to `face` through the framework's own bridge.
 *
 * `Neo.get` resolves instances inside the app worker, and `page.evaluate` runs on
 * the main thread where it does not exist. `Neo.worker.App` is the channel a spec
 * uses to reach worker instances, the same one the dock fixtures drive.
 * @param {Object} page
 * @param {String} face
 * @returns {Promise<void>}
 */
async function turnTo(page, face) {
    const layoutId = await page.evaluate(() =>
        document.querySelector('.neo-plane').id.replace(/__plane$/, ''));

    await page.evaluate((args) => Neo.worker.App.setConfigs({
        id: args.id, activeFace: args.face
    }), {id: layoutId, face});

    await waitForCubeToSettle(page);
}

/**
 * @summary Waits until the cube stops moving.
 *
 * The container's `--rot-x`/`--rot-y` update synchronously, but the transform
 * that MOVES the cube belongs to `.neo-box` and transitions over 300ms
 * (`resources/scss/src/layout/Cube.scss`). A hit test taken while that
 * transition is running sees the cube mid-turn and returns the face it is
 * passing through, not the one it is turning to. Waiting on the custom property
 * alone is therefore not enough: this waits for the box's own transform to hold
 * the same value across two reads.
 * @param {Object} page
 * @returns {Promise<void>}
 */
async function waitForCubeToSettle(page) {
    await page.evaluate(() => new Promise((resolve) => {
        const box = document.querySelector('.neo-layout-cube .neo-box');
        let last = null;
        let stableFrames = 0;
        const tick = () => {
            const now = getComputedStyle(box).transform;
            stableFrames = now === last ? stableFrames + 1 : 0;
            last = now;
            if (stableFrames >= 3) resolve();
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }));
}

test.describe('Neo.layout.Cube', () => {
    test('the active face is the one facing the viewer, for all six', async ({page}) => {
        const centre = await openFixture(page);

        for (const face of FACES) {
            await turnTo(page, face);

            // The hit test is the assertion. A cube whose faces all share one
            // plane, or whose rotation is composed in the wrong order, returns
            // some other face here while every config value still reads correct.
            const visible = await page.evaluate((args) => {
                const el    = document.elementFromPoint(args.pt.cx, args.pt.cy);
                const names = args.faces;
                return el ? names.find(f => el.classList.contains(f)) || null : null;
            }, {pt: centre, faces: FACES});

            expect(visible, `the ${face} face is presented at the cube centre`).toBe(face);
        }
    });

    test('each face carries its own class and axis group', async ({page}) => {
        await openFixture(page);

        const classes = await page.evaluate(() =>
            [...document.querySelectorAll('.neo-face')].map(f => f.className));

        expect(classes).toHaveLength(6);

        for (const [index, face] of FACES.entries()) {
            expect(classes[index], `child ${index} is the ${face} face`)
                .toContain(`neo-face ${face}`);
            expect(classes[index], `${face} carries ${EXPECTED_AXIS[face]}`)
                .toContain(EXPECTED_AXIS[face]);
        }
    });

    test('activeFace derives the rotation from the faces table', async ({page}) => {
        await openFixture(page);

        for (const face of FACES) {
            await turnTo(page, face);
            const [x, y] = EXPECTED_ROTATIONS[face];

            const written = await page.evaluate(() => {
                const cs = getComputedStyle(document.querySelector('.neo-layout-cube'));
                return {
                    x: cs.getPropertyValue('--rot-x').trim(),
                    y: cs.getPropertyValue('--rot-y').trim(),
                    z: cs.getPropertyValue('--rot-z').trim()
                };
            });

            expect([written.x, written.y], `${face} writes its rotation`).toEqual([x, y]);
            expect(written.z, `${face} leaves Z alone`).toBe('0deg');
        }
    });

    test('activeFace set beside a pending rotateX wins, and clears it', async ({page}) => {
        await page.goto('test/playwright/component/apps/layout-cube/index.html');
        await expect(page.locator('.neo-layout-cube')).toBeAttached({timeout: 15000});
        await waitForCubeToSettle(page);

        // Both in one config object, which is the interaction the ticket calls
        // the subtlest thing in the file: afterSetActiveIndex deletes a pending
        // rotateX out of the config symbol when activeIndex had no prior number.
        const layoutId = await page.evaluate(() =>
            document.querySelector('.neo-plane').id.replace(/__plane$/, ''));

        await page.evaluate((id) => Neo.worker.App.setConfigs({
            id, activeFace: 'back', rotateX: 45
        }), layoutId);

        await waitForCubeToSettle(page);

        const result = await page.evaluate(() => {
            const cs = getComputedStyle(document.querySelector('.neo-layout-cube'));
            return {
                x: cs.getPropertyValue('--rot-x').trim(),
                y: cs.getPropertyValue('--rot-y').trim()
            };
        });

        // `back` is [0, 180, 0], so the derivation wins and the pending 45 on X
        // is discarded rather than merged.
        expect(result).toEqual({x: '0deg', y: '180deg'});
    });
});
