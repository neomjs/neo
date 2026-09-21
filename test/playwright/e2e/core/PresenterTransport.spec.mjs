import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A canvas driven by the Canvas Worker stays in its own document and still receives pixels.
 *
 * Both halves matter and they fail differently.
 *
 * **Stays in its own document** is the structural half. `transferControlToOffscreen()` is irreversible: once
 * a canvas is transferred, `getContext('2d')` on it throws `InvalidStateError` forever. So the throw is a
 * precise, unfakeable witness that the node was handed away — and its absence is the witness that it was
 * not. That is the property the renderer-kill depends on, because a canvas a document no longer owns is
 * exactly what a worker in another process must never paint into.
 *
 * **Still receives pixels** is the behavioural half, and without it the first is satisfied trivially: never
 * transferring and never drawing would pass a structural check while rendering nothing. Reading the canvas
 * back catches that.
 *
 * The subject is `apps/portal` because it declares a canvas worker and draws several canvases, and unlike
 * the workstation app it carries no animated offscreen work, so it runs on a hosted runner.
 *
 * Canvases without a `neo-canvas-` id belong to other libraries on the page and are ignored — they are not
 * this engine's to govern, and including them would make the assertion depend on third-party behaviour.
 */
const
    APP      = '/apps/portal/index.html',
    SETTLE   = 5000,
    VIEWPORT = '.neo-viewport';

/**
 * Both arms assert the same contract; only `devicePixelRatio` differs.
 *
 * The DPR arm is not decoration. A hosted runner reports `devicePixelRatio: 1`, so at the default scale the
 * conversion between the CSS box and the backing store is a multiplication by one — it cannot distinguish a
 * correct implementation from one that ignores DPR entirely. Every retina laptop runs the other arm, so
 * without it the rule would be unverified for the common case rather than the rare one.
 * @param {Object} page
 */
const assertPresented = async page => {
        const problems = [];

        page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
        page.on('console', message => message.type() === 'error' && problems.push(`console: ${message.text()}`));

        await page.goto(APP);
        await page.locator(VIEWPORT).first().waitFor({state: 'attached', timeout: 60000});
        await page.waitForFunction(() => document.querySelectorAll('canvas[id^="neo-canvas-"]').length > 0, null, {timeout: 60000});

        await page.waitForTimeout(SETTLE); // wall-clock-under-test: the frame loop is rAF-paced, so this is frames rather than a guess

        const report = await page.evaluate(() => [...document.querySelectorAll('canvas[id^="neo-canvas-"]')].map(canvas => {
            let painted = null;

            try {
                const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
                painted = data ? data.some(value => value !== 0) : null
            } catch (error) {
                painted = `throw: ${error.name}`
            }

            return {
                backing: `${canvas.width}x${canvas.height}`,
                id     : canvas.id,
                painted,
                // What the backing store MUST be for a frame to land 1:1 rather than clipped.
                wanted : `${Math.round(canvas.clientWidth * devicePixelRatio)}x${Math.round(canvas.clientHeight * devicePixelRatio)}`
            }
        }));

        console.log('neo canvases:', JSON.stringify(report));

        expect(report.length, 'the subject app must draw neo canvases at all').toBeGreaterThan(0);

        expect(
            report.filter(entry => entry.painted === 'throw: InvalidStateError'),
            'no neo canvas may have been transferred out of its document — InvalidStateError is that transfer, and it is irreversible'
        ).toEqual([]);

        expect(
            report.some(entry => entry.painted === true),
            'frames must actually arrive: a canvas that is never transferred and never painted would satisfy the check above while rendering nothing'
        ).toBe(true);

        // The third half, and the one a pixel check cannot see. `putImageData` writes device pixels at 1:1
        // and ignores canvas scaling, so a frame bigger than the backing store is clipped to its top-left
        // corner and then stretched over the CSS box — visibly wrong, and every pixel assertion above still
        // passes. An unsized `<canvas>` defaults to 300x150 however large its CSS box is, which is exactly
        // the shape this caught.
        expect(
            report.filter(entry => entry.backing !== entry.wanted),
            'every neo canvas backing store must equal its CSS box in device pixels, or frames land clipped'
        ).toEqual([]);

        expect(problems, 'the presenter path must not log errors').toEqual([])
};

test.describe('a worker-driven canvas is presented locally, not transferred away', () => {
    test.setTimeout(180000);

    test('every neo canvas keeps its context, carries pixels, and matches its backing store', async ({page}) => {
        await assertPresented(page)
    })
});

test.describe('the same contract at devicePixelRatio 2', () => {
    test.use({deviceScaleFactor: 2});
    test.setTimeout(180000);

    test('a retina backing store is the CSS box times the ratio, not the CSS box', async ({page}) => {
        expect(await page.evaluate(() => devicePixelRatio), 'this arm is pointless unless the ratio really is 2').toBe(2);

        await assertPresented(page)
    })
});
